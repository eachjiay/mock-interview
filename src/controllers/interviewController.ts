import type { Request, Response } from 'express';
import type { ScoringProviderName, TranscriptProviderName } from '../types.js';
import {
  createInterviewSession,
  getInterviewDetail,
  markInterviewFailed,
  queueFullInterviewProcessing,
  queueInterviewAnalysis,
  queueInterviewTranscription,
  saveInterviewAudio,
  segmentInterviewTranscript,
} from '../services/interviewService.js';

function toInterviewId(value: string) {
  const interviewId = Number(value);
  if (!Number.isInteger(interviewId) || interviewId <= 0) {
    throw new Error('Invalid interview id.');
  }
  return interviewId;
}

function getParamId(req: Request) {
  const raw = req.params.id;
  if (Array.isArray(raw) || !raw) {
    throw new Error('Invalid interview id.');
  }
  return raw;
}

export async function createInterview(req: Request, res: Response) {
  try {
    const { candidateName, questionText, referenceText, notes, questionId, documentId } = req.body;
    if (!referenceText && !questionId && !documentId) {
      return res.status(400).json({ error: 'referenceText or questionId/documentId is required.' });
    }
    const interview = await createInterviewSession({
      candidateName,
      questionText,
      referenceText,
      notes,
      questionId: normalizeOptionalNumber(questionId),
      documentId: normalizeOptionalNumber(documentId)
    });
    res.status(201).json(interview);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function processInterviewUpload(req: Request, res: Response) {
  let interviewId = 0;
  try {
    const file = req.file;
    const { candidateName, questionText, referenceText, notes, providers, questionId, documentId } = req.body;
    if (!referenceText && !questionId && !documentId) {
      return res.status(400).json({ error: 'referenceText or questionId/documentId is required.' });
    }
    if (!file) {
      return res.status(400).json({ error: 'audio file is required.' });
    }

    const interview = await createInterviewSession({
      candidateName,
      questionText,
      referenceText,
      notes,
      questionId: normalizeOptionalNumber(questionId),
      documentId: normalizeOptionalNumber(documentId)
    });
    interviewId = interview.id;
    await saveInterviewAudio(interviewId, file.path, file.originalname);
    const task = await queueFullInterviewProcessing(interviewId, providers);
    res.status(202).json(task);
  } catch (error) {
    if (interviewId > 0) {
      await markInterviewFailed(interviewId);
    }
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function uploadAudio(req: Request, res: Response) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'audio file is required.' });
    }
    const interviewId = toInterviewId(getParamId(req));
    const interview = await saveInterviewAudio(interviewId, file.path, file.originalname);
    res.json(interview);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function transcribe(req: Request, res: Response) {
  try {
    const interviewId = toInterviewId(getParamId(req));
    const task = await queueInterviewTranscription(interviewId, req.body.providers);
    res.status(202).json(task);
  } catch (error) {
    await safeFail(req.params.id);
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function analyze(req: Request, res: Response) {
  try {
    const interviewId = toInterviewId(getParamId(req));
    const transcriptProvider = normalizeTranscriptProvider(req.body.transcriptProvider || req.body.provider);
    const scoringProvider = normalizeScoringProvider(req.body.scoringProvider);
    const audioFileUrl = normalizeOptionalString(req.body.audioFileUrl);
    const task = await queueInterviewAnalysis(interviewId, {
      preferredTranscriptProvider: transcriptProvider,
      scoringProvider,
      audioFileUrl
    });
    res.status(202).json(task);
  } catch (error) {
    await safeFail(req.params.id);
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function getInterview(req: Request, res: Response) {
  try {
    const interviewId = toInterviewId(getParamId(req));
    const detail = await getInterviewDetail(interviewId);
    if (!detail) {
      return res.status(404).json({ error: 'Interview not found.' });
    }
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function segmentInterview(req: Request, res: Response) {
  try {
    const interviewId = toInterviewId(getParamId(req));
    const provider = normalizeTranscriptProvider(req.body.provider);
    const result = await segmentInterviewTranscript(interviewId, provider);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

async function safeFail(id: string | string[] | undefined) {
  if (!id || Array.isArray(id)) {
    return;
  }
  const interviewId = Number(id);
  if (Number.isInteger(interviewId) && interviewId > 0) {
    await markInterviewFailed(interviewId);
  }
}

function normalizeOptionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const normalized = Array.isArray(value) ? value[0] : value;
  const numberValue = Number(normalized);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error('Invalid numeric identifier.');
  }
  return numberValue;
}

function normalizeTranscriptProvider(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized !== 'openai' && normalized !== 'xunfei' && normalized !== 'volcengine') {
    throw new Error('Invalid transcript provider.');
  }
  return normalized as TranscriptProviderName;
}

function normalizeScoringProvider(value: unknown) {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (normalized !== 'openai' && normalized !== 'xunfei') {
    throw new Error('Invalid scoring provider.');
  }
  return normalized as ScoringProviderName;
}

function normalizeOptionalString(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const normalized = Array.isArray(value) ? value[0] : value;
  if (typeof normalized !== 'string') {
    return undefined;
  }
  const trimmed = normalized.trim();
  return trimmed || undefined;
}
