import { readDB, writeDB } from '../db/database.js';
import type { DocumentRecord, QuestionRecord } from '../types.js';

interface CreateDocumentInput {
  title: string;
  sourceType: 'upload' | 'local';
  originalName: string;
  storedPath: string;
  text: string;
}

export async function createDocument(input: CreateDocumentInput): Promise<DocumentRecord> {
  let createdId = 0;
  await writeDB((data) => {
    createdId = ++data.counters.documents;
    const timestamp = new Date().toISOString();
    data.documents.push({
      id: createdId,
      title: input.title,
      sourceType: input.sourceType,
      originalName: input.originalName,
      storedPath: input.storedPath,
      text: input.text,
      questionCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    });
  });

  const document = await getDocumentById(createdId);
  if (!document) {
    throw new Error('Failed to create document.');
  }
  return document;
}

export async function updateDocumentQuestionCount(documentId: number, count: number) {
  await writeDB((data) => {
    const document = data.documents.find((item) => item.id === documentId);
    if (!document) {
      throw new Error('Document not found.');
    }
    document.questionCount = count;
    document.updatedAt = new Date().toISOString();
  });
}

export async function replaceQuestions(documentId: number, questions: Array<Omit<QuestionRecord, 'id' | 'createdAt' | 'documentId'>>) {
  await writeDB((data) => {
    const previousQuestionIds = data.questions.filter((item) => item.documentId === documentId).map((item) => item.id);
    data.questions = data.questions.filter((item) => item.documentId !== documentId);
    data.questionMediaAssets = data.questionMediaAssets.filter((item) => !previousQuestionIds.includes(item.questionId));
    for (const question of questions) {
      const id = ++data.counters.questions;
      data.questions.push({
        id,
        documentId,
        prompt: question.prompt,
        referenceAnswer: question.referenceAnswer,
        keywords: question.keywords,
        createdAt: new Date().toISOString()
      });
    }
    const document = data.documents.find((item) => item.id === documentId);
    if (document) {
      document.questionCount = questions.length;
      document.updatedAt = new Date().toISOString();
    }
  });
}

export async function getDocumentById(documentId: number): Promise<DocumentRecord | null> {
  const data = await readDB();
  return data.documents.find((item) => item.id === documentId) || null;
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const data = await readDB();
  return [...data.documents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listQuestionsByDocumentId(documentId: number): Promise<QuestionRecord[]> {
  const data = await readDB();
  return data.questions.filter((item) => item.documentId === documentId);
}

export async function getQuestionById(questionId: number): Promise<QuestionRecord | null> {
  const data = await readDB();
  return data.questions.find((item) => item.id === questionId) || null;
}

export async function getRandomQuestions(documentId: number, count: number): Promise<QuestionRecord[]> {
  const all = await listQuestionsByDocumentId(documentId);
  const shuffled = [...all];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex]!, shuffled[index]!];
  }
  return shuffled.slice(0, Math.max(1, Math.min(count, shuffled.length)));
}
