import type { Request, Response } from 'express';
import { getDocumentDetail, getRandomQuestionsForDocument, importDocumentFromLocal, importDocumentFromUpload, listDocumentSummaries } from '../services/documentService.js';

function toDocumentId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    throw new Error('Invalid document id.');
  }
  const documentId = Number(value);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error('Invalid document id.');
  }
  return documentId;
}

export async function uploadDocument(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'document file is required.' });
    }
    const title = typeof req.body.title === 'string' ? req.body.title : undefined;
    const detail = await importDocumentFromUpload(file.path, file.originalname, title);
    res.status(201).json(detail);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function importDocumentByLocalPath(req: Request, res: Response) {
  try {
    const { filePath, title } = req.body;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'filePath is required.' });
    }
    const detail = await importDocumentFromLocal(filePath, typeof title === 'string' ? title : undefined);
    res.status(201).json(detail);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function listDocuments(req: Request, res: Response) {
  try {
    const documents = await listDocumentSummaries();
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getDocument(req: Request, res: Response) {
  try {
    const documentId = toDocumentId(req.params.id);
    const detail = await getDocumentDetail(documentId);
    if (!detail) {
      return res.status(404).json({ error: 'Document not found.' });
    }
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getRandomQuestions(req: Request, res: Response) {
  try {
    const documentId = toDocumentId(req.params.id);
    const count = Math.max(1, Math.min(Number(req.query.count || 1), 20));
    const questions = await getRandomQuestionsForDocument(documentId, count);
    res.json({ questions });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
