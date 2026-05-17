import { readDB, writeDB } from '../db/database.js';
import type { AnalysisResult, CreateInterviewInput, InterviewRecord, StoredAnalysis, StoredTranscript, TranscriptResult } from '../types.js';

export async function createInterview(input: CreateInterviewInput): Promise<InterviewRecord | null> {
  let createdId = 0;
  await writeDB((data) => {
    createdId = ++data.counters.interviews;
    const timestamp = new Date().toISOString();
    data.interviews.push({
      id: createdId,
      candidateName: input.candidateName,
      questionText: input.questionText,
      referenceText: input.referenceText,
      notes: input.notes,
      audioPath: null,
      audioOriginalName: null,
      status: 'created',
      activeTranscriptProvider: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  });
  return getInterviewById(createdId);
}

export async function attachAudio(interviewId: number, audioPath: string, originalName: string): Promise<InterviewRecord | null> {
  await writeDB((data) => {
    const interview = data.interviews.find((item) => item.id === interviewId);
    if (!interview) {
      throw new Error('Interview not found.');
    }
    interview.audioPath = audioPath;
    interview.audioOriginalName = originalName;
    interview.status = 'uploaded';
    interview.errorMessage = null;
    interview.updatedAt = new Date().toISOString();
  });
  return getInterviewById(interviewId);
}

export async function updateInterviewStatus(
  interviewId: number,
  status: 'created' | 'uploaded' | 'transcribing' | 'transcribed' | 'analyzing' | 'analyzed' | 'failed',
  options?: {
    activeTranscriptProvider?: InterviewRecord['activeTranscriptProvider'];
    errorMessage?: string | null;
  }
) {
  await writeDB((data) => {
    const interview = data.interviews.find((item) => item.id === interviewId);
    if (!interview) {
      throw new Error('Interview not found.');
    }
    interview.status = status;
    if (options && 'activeTranscriptProvider' in options) {
      interview.activeTranscriptProvider = options.activeTranscriptProvider ?? null;
    }
    if (options && 'errorMessage' in options) {
      interview.errorMessage = options.errorMessage ?? null;
    }
    interview.updatedAt = new Date().toISOString();
  });
}

export async function saveTranscript(interviewId: number, transcript: TranscriptResult) {
  await writeDB((data) => {
    const interview = data.interviews.find((item) => item.id === interviewId);
    if (!interview) {
      throw new Error('Interview not found.');
    }
    const transcriptId = ++data.counters.transcripts;
    data.transcripts.push({
      id: transcriptId,
      interviewId,
      createdAt: new Date().toISOString(),
      ...transcript
    });
    interview.status = 'transcribed';
    interview.activeTranscriptProvider = transcript.provider;
    interview.errorMessage = null;
    interview.updatedAt = new Date().toISOString();
  });
}

export async function saveAnalysis(interviewId: number, provider: string, model: string, analysis: AnalysisResult) {
  await writeDB((data) => {
    const interview = data.interviews.find((item) => item.id === interviewId);
    if (!interview) {
      throw new Error('Interview not found.');
    }
    const analysisId = ++data.counters.analyses;
    data.analyses.push({
      id: analysisId,
      interviewId,
      transcriptProvider: provider,
      scoringModel: model,
      createdAt: new Date().toISOString(),
      ...analysis
    });
    interview.status = 'analyzed';
    interview.errorMessage = null;
    interview.updatedAt = new Date().toISOString();
  });
}

export async function getInterviewById(interviewId: number): Promise<InterviewRecord | null> {
  const data = await readDB();
  return data.interviews.find((item) => item.id === interviewId) || null;
}

export async function getTranscripts(interviewId: number): Promise<StoredTranscript[]> {
  const data = await readDB();
  return data.transcripts
    .filter((item) => item.interviewId === interviewId)
    .map(({ interviewId: _interviewId, id: _id, raw: _raw, ...rest }) => rest);
}

export async function getLatestTranscript(interviewId: number, provider?: string) {
  const data = await readDB();
  const matches = data.transcripts.filter((item) => item.interviewId === interviewId && (!provider || item.provider === provider));
  const latest = matches.at(-1);
  if (!latest) {
    return null;
  }
  return {
    provider: latest.provider,
    model: latest.model,
    text: latest.text
  };
}

export async function getLatestAnalysis(interviewId: number): Promise<StoredAnalysis | null> {
  const data = await readDB();
  const latest = data.analyses.filter((item) => item.interviewId === interviewId).at(-1);
  if (!latest) {
    return null;
  }
  const { raw: _raw, ...rest } = latest;
  return rest as StoredAnalysis;
}
