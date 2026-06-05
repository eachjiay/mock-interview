import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { config } from '../config.js';
import { getQuestionById, listQuestionsByDocumentId } from '../repositories/documentRepository.js';
import { getQuestionMediaAssetByQuestionId, saveQuestionMediaAsset } from '../repositories/questionMediaRepository.js';
import type { QuestionMediaAssetRecord } from '../types.js';
import { runJob } from './jobRunnerService.js';
import { ensureParentDir } from '../utils/fs.js';
import { isOssConfigured, uploadBufferToOss } from './ossStorageService.js';

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

interface UpsertQuestionMediaInput {
  audioUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  voice?: string | null;
  avatarName?: string | null;
  instructions?: string | null;
}

interface QueueQuestionMediaGenerationInput {
  force?: boolean;
  voice?: string;
  avatarName?: string;
  instructions?: string;
  imageUrl?: string;
  videoUrl?: string;
}

interface BatchQuestionMediaGenerationInput extends QueueQuestionMediaGenerationInput {
  documentId?: number;
  questionIds?: number[];
}

export async function getQuestionMediaDetail(questionId: number) {
  const question = await getQuestionById(questionId);
  if (!question) {
    throw new Error('Question not found.');
  }

  const mediaAsset = await getQuestionMediaAssetByQuestionId(questionId);
  return {
    question,
    mediaAsset
  };
}

export async function upsertQuestionMedia(questionId: number, input: UpsertQuestionMediaInput) {
  const question = await getQuestionById(questionId);
  if (!question) {
    throw new Error('Question not found.');
  }

  const hasAnyAsset = Boolean(input.audioUrl || input.imageUrl || input.videoUrl);
  const asset = await saveQuestionMediaAsset(questionId, {
    status: hasAnyAsset ? 'ready' : 'missing',
    sourceText: question.prompt,
    audioUrl: input.audioUrl ?? undefined,
    imageUrl: input.imageUrl ?? undefined,
    videoUrl: input.videoUrl ?? undefined,
    voice: input.voice ?? undefined,
    avatarName: input.avatarName ?? undefined,
    instructions: input.instructions ?? undefined,
    voiceProvider: input.audioUrl ? 'manual' : undefined,
    imageProvider: input.imageUrl ? 'manual' : undefined,
    videoProvider: input.videoUrl ? 'manual' : undefined,
    errorMessage: null
  });

  return {
    question,
    mediaAsset: asset
  };
}

export async function queueQuestionMediaGeneration(questionId: number, input: QueueQuestionMediaGenerationInput = {}) {
  const question = await getQuestionById(questionId);
  if (!question) {
    throw new Error('Question not found.');
  }

  const existing = await getQuestionMediaAssetByQuestionId(questionId);
  const voice = input.voice || existing?.voice || config.openaiTtsVoice;
  const avatarName = input.avatarName || existing?.avatarName || 'default-interviewer';
  const instructions = input.instructions || existing?.instructions || config.openaiTtsInstructions;

  await saveQuestionMediaAsset(questionId, {
    status: 'queued',
    sourceText: question.prompt,
    voice,
    avatarName,
    instructions,
    imageUrl: input.imageUrl ?? existing?.imageUrl ?? (config.defaultQuestionImageUrl || null),
    videoUrl: input.videoUrl ?? existing?.videoUrl ?? (config.defaultQuestionVideoUrl || null),
    errorMessage: null
  });

  const started = runJob(`question-media:${questionId}`, async () => {
    try {
      await generateQuestionMedia(questionId, {
        force: input.force,
        voice,
        avatarName,
        instructions,
        imageUrl: input.imageUrl,
        videoUrl: input.videoUrl
      });
    } catch (error) {
      await saveQuestionMediaAsset(questionId, {
        status: 'failed',
        errorMessage: (error as Error).message
      });
    }
  });

  return {
    questionId,
    status: started ? ('queued' as const) : ('generating' as const)
  };
}

export async function queueBatchQuestionMediaGeneration(input: BatchQuestionMediaGenerationInput = {}) {
  const questionIds = await resolveBatchQuestionIds(input);
  if (!questionIds.length) {
    throw new Error('No questions found for media generation.');
  }

  const results = [];
  let queuedCount = 0;
  for (const questionId of questionIds) {
    const queued = await queueQuestionMediaGeneration(questionId, input);
    queuedCount += 1;
    results.push(queued);
  }

  return {
    queuedCount,
    questionIds,
    results
  };
}

async function generateQuestionMedia(questionId: number, input: QueueQuestionMediaGenerationInput) {
  const question = await getQuestionById(questionId);
  if (!question) {
    throw new Error('Question not found.');
  }

  const existing = await getQuestionMediaAssetByQuestionId(questionId);
  const voice = input.voice || existing?.voice || config.openaiTtsVoice;
  const avatarName = input.avatarName || existing?.avatarName || 'default-interviewer';
  const instructions = input.instructions || existing?.instructions || config.openaiTtsInstructions;

  await saveQuestionMediaAsset(questionId, {
    status: 'generating',
    sourceText: question.prompt,
    voice,
    avatarName,
    instructions,
    imageUrl: input.imageUrl ?? existing?.imageUrl ?? (config.defaultQuestionImageUrl || null),
    videoUrl: input.videoUrl ?? existing?.videoUrl ?? (config.defaultQuestionVideoUrl || null),
    errorMessage: null
  });

  const audio = await ensureQuestionAudio(questionId, question.prompt, voice, instructions, input.force || false, existing);
  const imageUrl = input.imageUrl ?? existing?.imageUrl ?? (config.defaultQuestionImageUrl || null);
  const videoUrl = input.videoUrl ?? existing?.videoUrl ?? (config.defaultQuestionVideoUrl || null);

  await saveQuestionMediaAsset(questionId, {
    status: 'ready',
    sourceText: question.prompt,
    audioPath: audio.audioPath,
    audioUrl: audio.audioUrl,
    imageUrl,
    videoUrl,
    voiceProvider: 'openai-tts',
    imageProvider: imageUrl ? inferVisualProvider(input.imageUrl, existing?.imageUrl, config.defaultQuestionImageUrl) : null,
    videoProvider: videoUrl ? inferVisualProvider(input.videoUrl, existing?.videoUrl, config.defaultQuestionVideoUrl) : null,
    voice,
    avatarName,
    instructions,
    errorMessage: null
  });
}

async function ensureQuestionAudio(
  questionId: number,
  sourceText: string,
  voice: string,
  instructions: string,
  force: boolean,
  existing: QuestionMediaAssetRecord | null
) {
  if (!client) {
    throw new Error('OPENAI_API_KEY is required for question audio generation.');
  }

  if (!force && existing?.audioPath && existing.audioUrl) {
    return {
      audioPath: existing.audioPath,
      audioUrl: existing.audioUrl
    };
  }

  const speech = await client.audio.speech.create({
    model: config.openaiTtsModel,
    voice,
    input: sourceText,
    instructions,
    response_format: 'mp3'
  });

  const audioBuffer = Buffer.from(await speech.arrayBuffer());
  const audioPath = path.join(config.questionMediaDir, `question-${questionId}.mp3`);
  await ensureParentDir(audioPath);
  await fs.writeFile(audioPath, audioBuffer);

  const storedPath = path.relative(process.cwd(), audioPath);
  if (isOssConfigured()) {
    const ossObjectKey = buildQuestionAudioOssKey(questionId);
    const ossUpload = await uploadBufferToOss(ossObjectKey, audioBuffer, 'audio/mpeg');
    return {
      audioPath: storedPath,
      audioUrl: ossUpload.url
    };
  }

  return {
    audioPath: storedPath,
    audioUrl: resolvePublicAssetUrl(storedPath)
  };
}

async function resolveBatchQuestionIds(input: BatchQuestionMediaGenerationInput) {
  if (input.questionIds?.length) {
    return Array.from(new Set(input.questionIds.filter((item) => Number.isInteger(item) && item > 0)));
  }

  if (!input.documentId) {
    throw new Error('documentId or questionIds is required.');
  }

  const questions = await listQuestionsByDocumentId(input.documentId);
  return questions.map((item) => item.id);
}

function resolvePublicAssetUrl(storedPath: string) {
  if (!config.publicBaseUrl) {
    return null;
  }

  const normalized = storedPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return `${config.publicBaseUrl}/${normalized}`;
}

function inferVisualProvider(
  explicitValue: string | undefined,
  existingValue: string | null | undefined,
  defaultValue: string
) {
  if (explicitValue) {
    return 'manual';
  }
  if (existingValue) {
    return 'manual';
  }
  if (defaultValue) {
    return 'preset';
  }
  return null;
}

function buildQuestionAudioOssKey(questionId: number) {
  const parts = [config.ossPrefix || 'mock-interview', 'question-media', `question-${questionId}.mp3`];
  return parts.filter(Boolean).join('/');
}
