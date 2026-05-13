export type InterviewStatus = 'created' | 'uploaded' | 'transcribed' | 'analyzed' | 'failed';

export type TranscriptProviderName = 'openai' | 'xunfei' | 'volcengine';

export interface CreateInterviewInput {
  candidateName?: string;
  questionText?: string;
  referenceText: string;
  notes?: string;
  questionId?: number;
  documentId?: number;
}

export interface InterviewRecord extends CreateInterviewInput {
  id: number;
  audioPath?: string | null;
  audioOriginalName?: string | null;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: number;
  title: string;
  sourceType: 'upload' | 'local';
  originalName: string;
  storedPath: string;
  text: string;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionRecord {
  id: number;
  documentId: number;
  prompt: string;
  referenceAnswer: string;
  keywords: string[];
  createdAt: string;
}

export interface TranscriptResult {
  provider: TranscriptProviderName;
  model: string;
  text: string;
  durationSeconds?: number;
  raw?: unknown;
}

export interface AnalysisResult {
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  mismatches: string[];
  raw?: unknown;
}

export interface StoredTranscript {
  provider: TranscriptProviderName;
  model: string;
  text: string;
  durationSeconds?: number;
  createdAt: string;
}

export interface StoredAnalysis extends AnalysisResult {
  transcriptProvider: string;
  scoringModel: string;
  createdAt: string;
}

export interface InterviewDetail {
  interview: InterviewRecord;
  transcripts: StoredTranscript[];
  analysis: StoredAnalysis | null;
}
