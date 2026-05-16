import path from 'node:path';
import { config } from '../config.js';
import {
  attachAudio,
  createInterview,
  getInterviewById,
  getLatestAnalysis,
  getLatestTranscript,
  getTranscripts,
  saveAnalysis,
  saveTranscript,
  updateInterviewStatus
} from '../repositories/interviewRepository.js';
import { scoreTranscript } from './scoringService.js';
import { transcribeAudioFile, resolveTranscriptionProviders } from './transcriptionService.js';
import type {
  CreateInterviewInput,
  InterviewDetail,
  InterviewRecord,
  ScoringProviderName,
  TranscriptProviderName,
  TranscriptResult
} from '../types.js';
import { getQuestionForInterview } from './documentService.js';
import { runJob } from './jobRunnerService.js';
import { segmentTranscript } from './transcriptSegmentationService.js';

interface AnalyzeInterviewOptions {
  preferredTranscriptProvider?: TranscriptProviderName;
  scoringProvider?: ScoringProviderName;
  audioFileUrl?: string;
}

export async function createInterviewSession(input: CreateInterviewInput): Promise<InterviewRecord> {
  let payload = input;
  if ((!input.questionText || !input.referenceText) && (input.questionId || input.documentId)) {
    const question = await getQuestionForInterview(input.documentId, input.questionId);
    if (!question) {
      throw new Error('No question found for the selected document or question id.');
    }
    payload = {
      ...input,
      questionId: question.id,
      documentId: question.documentId,
      questionText: question.prompt,
      referenceText: question.referenceAnswer
    };
  }

  const interview = await createInterview(payload);
  if (!interview) {
    throw new Error('Failed to create interview.');
  }
  return interview;
}

export async function saveInterviewAudio(interviewId: number, storedFilePath: string, originalName: string): Promise<InterviewRecord> {
  const relativePath = path.relative(process.cwd(), storedFilePath);
  const interview = await attachAudio(interviewId, relativePath, originalName);
  if (!interview) {
    throw new Error('Interview not found.');
  }
  return interview;
}

export async function transcribeInterview(interviewId: number, providerInput?: unknown): Promise<TranscriptResult[]> {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    throw new Error('Interview not found.');
  }
  if (!interview.audioPath) {
    throw new Error('Audio has not been uploaded yet.');
  }

  const fullAudioPath = resolveStoredAudioPath(interview.audioPath);
  const providers = await resolveTranscriptionProviders(fullAudioPath, providerInput);
  const results = await transcribeAudioFile(fullAudioPath, providers);
  for (const transcript of results) {
    await saveTranscript(interviewId, transcript);
  }
  return results;
}

export async function analyzeInterview(interviewId: number, options: AnalyzeInterviewOptions = {}) {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    throw new Error('Interview not found.');
  }

  const scoringProvider = options.scoringProvider || resolveDefaultScoringProvider();
  const transcript = await getLatestTranscript(interviewId, options.preferredTranscriptProvider);

  if (scoringProvider === 'openai' && !transcript) {
    throw new Error('No transcript found for analysis.');
  }

  const audioFileUrl =
    scoringProvider === 'xunfei'
      ? options.audioFileUrl || resolveInterviewAudioUrl(interview)
      : undefined;

  const result = await scoreTranscript({
    scoringProvider,
    questionText: interview.questionText || undefined,
    referenceText: interview.referenceText,
    transcriptText: transcript?.text,
    audioFileUrl
  });

  await saveAnalysis(interviewId, transcript?.provider || interview.activeTranscriptProvider || 'xunfei', result.model, result.analysis);
  return {
    transcriptProvider: transcript?.provider || interview.activeTranscriptProvider || null,
    scoringProvider,
    scoringModel: result.model,
    audioFileUrl: audioFileUrl || null,
    ...result.analysis
  };
}

export async function processInterview(input: CreateInterviewInput & { interviewId?: number; providers?: unknown }) {
  const interview = input.interviewId ? await getInterviewById(input.interviewId) : await createInterview(input);
  if (!interview) {
    throw new Error('Failed to create interview.');
  }
  const transcripts = await transcribeInterview(interview.id, input.providers);
  const analysis = await analyzeInterview(interview.id, { preferredTranscriptProvider: transcripts[0]?.provider });
  return getInterviewDetail(interview.id);
}

export async function getInterviewDetail(interviewId: number): Promise<InterviewDetail | null> {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    return null;
  }
  const [transcripts, analysis] = await Promise.all([
    getTranscripts(interviewId),
    getLatestAnalysis(interviewId)
  ]);
  return {
    interview,
    transcripts,
    analysis
  };
}

export async function segmentInterviewTranscript(interviewId: number, preferredProvider?: TranscriptProviderName) {
  const transcript = await getLatestTranscript(interviewId, preferredProvider);
  if (!transcript) {
    throw new Error('No transcript found for segmentation.');
  }

  return {
    provider: transcript.provider,
    model: transcript.model,
    ...segmentTranscript({ transcriptText: transcript.text })
  };
}

export async function markInterviewFailed(interviewId: number) {
  await updateInterviewStatus(interviewId, 'failed');
}

export async function queueInterviewTranscription(interviewId: number, providerInput?: unknown) {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    throw new Error('Interview not found.');
  }
  if (!interview.audioPath) {
    throw new Error('Audio has not been uploaded yet.');
  }

  const fullAudioPath = resolveStoredAudioPath(interview.audioPath);
  const providers = await resolveTranscriptionProviders(fullAudioPath, providerInput);
  const activeProvider = providers[0] || null;

  await updateInterviewStatus(interviewId, 'transcribing', {
    activeTranscriptProvider: activeProvider,
    errorMessage: null
  });

  runJob(`transcribe:${interviewId}`, async () => {
    try {
      await transcribeInterview(interviewId, providers);
    } catch (error) {
      await updateInterviewStatus(interviewId, 'failed', {
        activeTranscriptProvider: activeProvider,
        errorMessage: (error as Error).message
      });
    }
  });

  return {
    interviewId,
    status: 'transcribing' as const,
    providers
  };
}

export async function queueInterviewAnalysis(interviewId: number, options: AnalyzeInterviewOptions = {}) {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    throw new Error('Interview not found.');
  }

  await updateInterviewStatus(interviewId, 'analyzing', {
    activeTranscriptProvider: options.preferredTranscriptProvider || interview.activeTranscriptProvider || null,
    errorMessage: null
  });

  runJob(`analyze:${interviewId}`, async () => {
    try {
      await analyzeInterview(interviewId, options);
    } catch (error) {
      await updateInterviewStatus(interviewId, 'failed', {
        activeTranscriptProvider: options.preferredTranscriptProvider || interview.activeTranscriptProvider || null,
        errorMessage: (error as Error).message
      });
    }
  });

  return {
    interviewId,
    status: 'analyzing' as const,
    provider: options.preferredTranscriptProvider || interview.activeTranscriptProvider || null,
    scoringProvider: options.scoringProvider || resolveDefaultScoringProvider(),
    audioFileUrl: options.audioFileUrl || null
  };
}

export async function queueFullInterviewProcessing(interviewId: number, providerInput?: unknown) {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    throw new Error('Interview not found.');
  }
  if (!interview.audioPath) {
    throw new Error('Audio has not been uploaded yet.');
  }

  const fullAudioPath = resolveStoredAudioPath(interview.audioPath);
  const providers = await resolveTranscriptionProviders(fullAudioPath, providerInput);
  const activeProvider = providers[0] || null;

  await updateInterviewStatus(interviewId, 'transcribing', {
    activeTranscriptProvider: activeProvider,
    errorMessage: null
  });

  runJob(`process:${interviewId}`, async () => {
    try {
      const transcripts = await transcribeInterview(interviewId, providers);
      await updateInterviewStatus(interviewId, 'analyzing', {
        activeTranscriptProvider: transcripts[0]?.provider || activeProvider,
        errorMessage: null
      });
      await analyzeInterview(interviewId, { preferredTranscriptProvider: transcripts[0]?.provider });
    } catch (error) {
      await updateInterviewStatus(interviewId, 'failed', {
        activeTranscriptProvider: activeProvider,
        errorMessage: (error as Error).message
      });
    }
  });

  return {
    interviewId,
    status: 'transcribing' as const,
    providers
  };
}

function resolveStoredAudioPath(audioPath: string) {
  return path.isAbsolute(audioPath) ? audioPath : path.join(process.cwd(), audioPath);
}

function resolveDefaultScoringProvider(): ScoringProviderName {
  return config.openaiApiKey ? 'openai' : 'xunfei';
}

function resolveInterviewAudioUrl(interview: InterviewRecord) {
  if (!interview.audioPath || !config.publicBaseUrl) {
    return undefined;
  }

  const normalizedPath = interview.audioPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  if (!normalizedPath) {
    return undefined;
  }

  return `${config.publicBaseUrl}/${normalizedPath}`;
}
