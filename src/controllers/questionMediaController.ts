import type { Request, Response } from 'express';
import {
  getQuestionMediaDetail,
  queueBatchQuestionMediaGeneration,
  queueQuestionMediaGeneration,
  upsertQuestionMedia
} from '../services/questionMediaService.js';

function toQuestionId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    throw new Error('Invalid question id.');
  }
  const questionId = Number(value);
  if (!Number.isInteger(questionId) || questionId <= 0) {
    throw new Error('Invalid question id.');
  }
  return questionId;
}

export async function getQuestionMedia(req: Request, res: Response) {
  try {
    const questionId = toQuestionId(req.params.id);
    const detail = await getQuestionMediaDetail(questionId);
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function putQuestionMedia(req: Request, res: Response) {
  try {
    const questionId = toQuestionId(req.params.id);
    const detail = await upsertQuestionMedia(questionId, {
      audioUrl: typeof req.body.audioUrl === 'string' ? req.body.audioUrl : null,
      imageUrl: typeof req.body.imageUrl === 'string' ? req.body.imageUrl : null,
      videoUrl: typeof req.body.videoUrl === 'string' ? req.body.videoUrl : null,
      voice: typeof req.body.voice === 'string' ? req.body.voice : null,
      avatarName: typeof req.body.avatarName === 'string' ? req.body.avatarName : null,
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions : null
    });
    res.json(detail);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function generateQuestionMedia(req: Request, res: Response) {
  try {
    const questionId = toQuestionId(req.params.id);
    const result = await queueQuestionMediaGeneration(questionId, {
      force: req.body.force === true,
      voice: typeof req.body.voice === 'string' ? req.body.voice : undefined,
      avatarName: typeof req.body.avatarName === 'string' ? req.body.avatarName : undefined,
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions : undefined,
      imageUrl: typeof req.body.imageUrl === 'string' ? req.body.imageUrl : undefined,
      videoUrl: typeof req.body.videoUrl === 'string' ? req.body.videoUrl : undefined
    });
    res.status(202).json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}

export async function generateQuestionMediaBatch(req: Request, res: Response) {
  try {
    const questionIds = Array.isArray(req.body.questionIds)
      ? req.body.questionIds.map((item: unknown) => Number(item)).filter((item: number) => Number.isInteger(item) && item > 0)
      : undefined;

    const result = await queueBatchQuestionMediaGeneration({
      documentId: Number.isInteger(Number(req.body.documentId)) && Number(req.body.documentId) > 0 ? Number(req.body.documentId) : undefined,
      questionIds,
      force: req.body.force === true,
      voice: typeof req.body.voice === 'string' ? req.body.voice : undefined,
      avatarName: typeof req.body.avatarName === 'string' ? req.body.avatarName : undefined,
      instructions: typeof req.body.instructions === 'string' ? req.body.instructions : undefined,
      imageUrl: typeof req.body.imageUrl === 'string' ? req.body.imageUrl : undefined,
      videoUrl: typeof req.body.videoUrl === 'string' ? req.body.videoUrl : undefined
    });

    res.status(202).json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
