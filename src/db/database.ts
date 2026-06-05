import fs from 'node:fs/promises';
import { config } from '../config.js';
import { ensureParentDir } from '../utils/fs.js';
import type {
  AnalysisResult,
  CreateInterviewInput,
  DocumentRecord,
  InterviewStatus,
  QuestionMediaAssetRecord,
  QuestionRecord,
  TranscriptResult
} from '../types.js';

interface InterviewRow extends CreateInterviewInput {
  id: number;
  audioPath?: string | null;
  audioOriginalName?: string | null;
  status: InterviewStatus;
  activeTranscriptProvider?: 'openai' | 'xunfei' | 'volcengine' | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TranscriptRow extends TranscriptResult {
  id: number;
  interviewId: number;
  createdAt: string;
}

interface AnalysisRow extends AnalysisResult {
  id: number;
  interviewId: number;
  transcriptProvider: string;
  scoringModel: string;
  createdAt: string;
}

interface DatabaseShape {
  counters: {
    documents: number;
    questions: number;
    questionMediaAssets: number;
    interviews: number;
    transcripts: number;
    analyses: number;
  };
  documents: DocumentRecord[];
  questions: QuestionRecord[];
  questionMediaAssets: QuestionMediaAssetRecord[];
  interviews: InterviewRow[];
  transcripts: TranscriptRow[];
  analyses: AnalysisRow[];
}

const initialState: DatabaseShape = {
  counters: {
    documents: 0,
    questions: 0,
    questionMediaAssets: 0,
    interviews: 0,
    transcripts: 0,
    analyses: 0
  },
  documents: [],
  questions: [],
  questionMediaAssets: [],
  interviews: [],
  transcripts: [],
  analyses: []
};

let writeChain = Promise.resolve();

export async function initDB() {
  await ensureParentDir(config.dbPath);
  try {
    await fs.access(config.dbPath);
  } catch {
    await fs.writeFile(config.dbPath, JSON.stringify(initialState, null, 2), 'utf8');
  }
}

export async function readDB() {
  const content = await fs.readFile(config.dbPath, 'utf8');
  return normalizeDB(JSON.parse(content) as Partial<DatabaseShape>);
}

export async function writeDB(updater: (data: DatabaseShape) => void | DatabaseShape) {
  writeChain = writeChain.then(async () => {
    const data = await readDB();
    const next = (updater(data) || data) as DatabaseShape;
    await fs.writeFile(config.dbPath, JSON.stringify(next, null, 2), 'utf8');
  });
  await writeChain;
}

function normalizeDB(data: Partial<DatabaseShape>): DatabaseShape {
  return {
    counters: {
      documents: data.counters?.documents || 0,
      questions: data.counters?.questions || 0,
      questionMediaAssets: data.counters?.questionMediaAssets || 0,
      interviews: data.counters?.interviews || 0,
      transcripts: data.counters?.transcripts || 0,
      analyses: data.counters?.analyses || 0
    },
    documents: data.documents || [],
    questions: data.questions || [],
    questionMediaAssets: data.questionMediaAssets || [],
    interviews: data.interviews || [],
    transcripts: data.transcripts || [],
    analyses: data.analyses || []
  };
}
