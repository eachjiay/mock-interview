import { readDB, writeDB } from '../db/database.js';
import type { QuestionMediaAssetRecord, QuestionMediaStatus } from '../types.js';

interface SaveQuestionMediaInput {
  status?: QuestionMediaStatus;
  sourceText?: string;
  audioUrl?: string | null;
  audioPath?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  voiceProvider?: string | null;
  imageProvider?: string | null;
  videoProvider?: string | null;
  voice?: string | null;
  avatarName?: string | null;
  instructions?: string | null;
  errorMessage?: string | null;
}

export async function saveQuestionMediaAsset(questionId: number, input: SaveQuestionMediaInput): Promise<QuestionMediaAssetRecord | null> {
  await writeDB((data) => {
    const question = data.questions.find((item) => item.id === questionId);
    if (!question) {
      throw new Error('Question not found.');
    }

    const timestamp = new Date().toISOString();
    let asset = data.questionMediaAssets.find((item) => item.questionId === questionId);

    if (!asset) {
      asset = {
        id: ++data.counters.questionMediaAssets,
        questionId,
        status: input.status || 'missing',
        sourceText: input.sourceText || question.prompt,
        audioUrl: input.audioUrl ?? null,
        audioPath: input.audioPath ?? null,
        imageUrl: input.imageUrl ?? null,
        videoUrl: input.videoUrl ?? null,
        voiceProvider: input.voiceProvider ?? null,
        imageProvider: input.imageProvider ?? null,
        videoProvider: input.videoProvider ?? null,
        voice: input.voice ?? null,
        avatarName: input.avatarName ?? null,
        instructions: input.instructions ?? null,
        errorMessage: input.errorMessage ?? null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      data.questionMediaAssets.push(asset);
      return;
    }

    if (input.status !== undefined) {
      asset.status = input.status;
    }
    if (input.sourceText !== undefined) {
      asset.sourceText = input.sourceText;
    }
    if ('audioUrl' in input) {
      asset.audioUrl = input.audioUrl ?? null;
    }
    if ('audioPath' in input) {
      asset.audioPath = input.audioPath ?? null;
    }
    if ('imageUrl' in input) {
      asset.imageUrl = input.imageUrl ?? null;
    }
    if ('videoUrl' in input) {
      asset.videoUrl = input.videoUrl ?? null;
    }
    if ('voiceProvider' in input) {
      asset.voiceProvider = input.voiceProvider ?? null;
    }
    if ('imageProvider' in input) {
      asset.imageProvider = input.imageProvider ?? null;
    }
    if ('videoProvider' in input) {
      asset.videoProvider = input.videoProvider ?? null;
    }
    if ('voice' in input) {
      asset.voice = input.voice ?? null;
    }
    if ('avatarName' in input) {
      asset.avatarName = input.avatarName ?? null;
    }
    if ('instructions' in input) {
      asset.instructions = input.instructions ?? null;
    }
    if ('errorMessage' in input) {
      asset.errorMessage = input.errorMessage ?? null;
    }
    asset.updatedAt = timestamp;
  });

  return getQuestionMediaAssetByQuestionId(questionId);
}

export async function getQuestionMediaAssetByQuestionId(questionId: number): Promise<QuestionMediaAssetRecord | null> {
  const data = await readDB();
  return data.questionMediaAssets.find((item) => item.questionId === questionId) || null;
}

export async function listQuestionMediaAssetsByQuestionIds(questionIds: number[]): Promise<QuestionMediaAssetRecord[]> {
  if (!questionIds.length) {
    return [];
  }
  const wanted = new Set(questionIds);
  const data = await readDB();
  return data.questionMediaAssets.filter((item) => wanted.has(item.questionId));
}
