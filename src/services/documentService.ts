import path from 'node:path';
import {
  createDocument,
  getDocumentById,
  getQuestionById,
  getRandomQuestions,
  listDocuments,
  listQuestionsByDocumentId,
  replaceQuestions
} from '../repositories/documentRepository.js';
import { parseDocumentText, extractQuestionsFromText } from './documentParserService.js';

export async function importDocumentFromUpload(filePath: string, originalName: string, title?: string) {
  const text = await parseDocumentText(filePath);
  const document = await createDocument({
    title: title?.trim() || path.basename(originalName, path.extname(originalName)),
    sourceType: 'upload',
    originalName,
    storedPath: path.relative(process.cwd(), filePath),
    text
  });
  const questions = extractQuestionsFromText(text);
  await replaceQuestions(document.id, questions);
  return getDocumentDetail(document.id);
}

export async function importDocumentFromLocal(filePath: string, title?: string) {
  const text = await parseDocumentText(filePath);
  const document = await createDocument({
    title: title?.trim() || path.basename(filePath, path.extname(filePath)),
    sourceType: 'local',
    originalName: path.basename(filePath),
    storedPath: filePath,
    text
  });
  const questions = extractQuestionsFromText(text);
  await replaceQuestions(document.id, questions);
  return getDocumentDetail(document.id);
}

export async function getDocumentDetail(documentId: number) {
  const [document, questions] = await Promise.all([
    getDocumentById(documentId),
    listQuestionsByDocumentId(documentId)
  ]);
  if (!document) {
    return null;
  }
  return {
    document,
    questions
  };
}

export async function getQuestionForInterview(documentId?: number, questionId?: number) {
  if (questionId) {
    return getQuestionById(questionId);
  }
  if (documentId) {
    const questions = await getRandomQuestions(documentId, 1);
    return questions[0] || null;
  }
  return null;
}

export async function listDocumentSummaries() {
  return listDocuments();
}

export async function getRandomQuestionsForDocument(documentId: number, count: number) {
  return getRandomQuestions(documentId, count);
}
