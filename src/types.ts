export type InterviewStatus =
  | 'created'
  | 'uploaded'
  | 'transcribing'
  | 'transcribed'
  | 'analyzing'
  | 'analyzed'
  | 'failed';

export type TranscriptProviderName = 'openai' | 'xunfei' | 'volcengine';
export type ScoringProviderName = 'openai' | 'xunfei';

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
  activeTranscriptProvider?: TranscriptProviderName | null;
  errorMessage?: string | null;
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

export interface TranscriptCleanResult {
  cleanedText: string;
  removedFillers: string[];
  notes: string[];
  raw?: unknown;
}

export type SpeakerGuess = 'interviewer' | 'candidate' | 'unknown';

export interface TranscriptSegment {
  speakerGuess: SpeakerGuess;
  text: string;
  reasons: string[];
}

export interface TranscriptQaPair {
  question: string;
  answer: string;
  questionSpeaker: SpeakerGuess;
  answerSpeaker: SpeakerGuess;
}

export interface TranscriptSegmentResult {
  segments: TranscriptSegment[];
  qaPairs: TranscriptQaPair[];
  notes: string[];
}

export interface XunfeiVoiceInsightResult {
  taskId: string;
  status: 'Running' | 'Finish' | 'Error';
  transcriptText?: string;
  subTaskResults: Array<{
    name: string;
    status: string;
    result: unknown;
  }>;
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
