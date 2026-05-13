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
import { parseProviderList } from './transcription/index.js';
import { transcribeAudioFile } from './transcriptionService.js';
import type { CreateInterviewInput, InterviewDetail, InterviewRecord, TranscriptProviderName, TranscriptResult } from '../types.js';
import { getQuestionForInterview } from './documentService.js';

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

  const providers = parseProviderList(providerInput);
  const fullAudioPath = path.isAbsolute(interview.audioPath)
    ? interview.audioPath
    : path.join(process.cwd(), interview.audioPath);

  const results = await transcribeAudioFile(fullAudioPath, providers);
  for (const transcript of results) {
    await saveTranscript(interviewId, transcript);
  }
  return results;
}

export async function analyzeInterview(interviewId: number, preferredProvider?: TranscriptProviderName) {
  const interview = await getInterviewById(interviewId);
  if (!interview) {
    throw new Error('Interview not found.');
  }

  const transcript = await getLatestTranscript(interviewId, preferredProvider);
  if (!transcript) {
    throw new Error('No transcript found for analysis.');
  }

  const result = await scoreTranscript({
    questionText: interview.questionText || undefined,
    referenceText: interview.referenceText,
    transcriptText: transcript.text
  });

  await saveAnalysis(interviewId, transcript.provider, result.model, result.analysis);
  return {
    transcriptProvider: transcript.provider,
    scoringModel: result.model,
    ...result.analysis
  };
}

export async function processInterview(input: CreateInterviewInput & { interviewId?: number; providers?: unknown }) {
  const interview = input.interviewId ? await getInterviewById(input.interviewId) : await createInterview(input);
  if (!interview) {
    throw new Error('Failed to create interview.');
  }
  const transcripts = await transcribeInterview(interview.id, input.providers);
  const analysis = await analyzeInterview(interview.id, transcripts[0]?.provider);
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

export async function markInterviewFailed(interviewId: number) {
  await updateInterviewStatus(interviewId, 'failed');
}
