import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { config } from '../config.js';
import { getQuestionById, listAllQuestions, listQuestionsByDocumentId } from '../repositories/documentRepository.js';
import {
  getQuestionMediaAssetByQuestionId,
  listQuestionMediaAssetsByQuestionIds,
  saveQuestionMediaAsset
} from '../repositories/questionMediaRepository.js';
import type { QuestionMediaAssetRecord } from '../types.js';
import { hasRunningJob, runJob } from './jobRunnerService.js';
import { ensureParentDir } from '../utils/fs.js';
import { isOssConfigured, uploadBufferToOss } from './ossStorageService.js';
import { generateAvatarVideo } from './avatarVideoService.js';

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;
const batchJobKey = 'question-media-batch';
const verifiedPublicUrls = new Set<string>();
let avatarVideoUnavailableReason: string | null = null;

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

interface QuestionMediaStatusInput {
  documentId?: number;
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
  const voice = input.voice || config.openaiTtsVoice;
  const avatarName = input.avatarName || existing?.avatarName || 'default-interviewer';
  const instructions = input.instructions || config.openaiTtsInstructions;

  if (
    !input.force &&
    existing?.status === 'ready' &&
    existing.audioUrl &&
    existing.videoUrl &&
    hasMatchingVoiceConfiguration(existing, voice, instructions)
  ) {
    return;
  }

  await saveQuestionMediaAsset(questionId, {
    status: 'queued',
    sourceText: question.prompt,
    voice,
    avatarName,
    instructions,
    imageUrl: resolveQuestionImageUrl(input, existing),
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

  if (hasRunningJob(batchJobKey)) {
    return {
      status: 'already_running' as const,
      queuedCount: 0,
      questionIds: [],
      skippedCount: questionIds.length,
      concurrency: config.questionMediaBatchConcurrency,
      message: 'A question media batch job is already running.'
    };
  }

  runJob(batchJobKey, async () => {
    await processQuestionMediaBatch(questionIds, input);
  });

  return {
    status: 'queued' as const,
    queuedCount: questionIds.length,
    questionIds,
    concurrency: config.questionMediaBatchConcurrency
  };
}

export async function getQuestionMediaGenerationStatus(input: QuestionMediaStatusInput = {}) {
  const questions = input.documentId ? await listQuestionsByDocumentId(input.documentId) : await listAllQuestions();
  const assets = await listQuestionMediaAssetsByQuestionIds(questions.map((item) => item.id));
  const assetMap = new Map(assets.map((item) => [item.questionId, item]));

  const counts = {
    total: questions.length,
    missing: 0,
    queued: 0,
    generating: 0,
    ready: 0,
    readyWithAudioAndVideo: 0,
    readyWithAudioOnly: 0,
    failed: 0
  };

  for (const question of questions) {
    const asset = assetMap.get(question.id);
    if (!asset) {
      counts.missing += 1;
      continue;
    }

    if (asset.status === 'ready') {
      counts.ready += 1;
      if (asset.audioUrl && asset.videoUrl) {
        counts.readyWithAudioAndVideo += 1;
      } else if (asset.audioUrl) {
        counts.readyWithAudioOnly += 1;
      }
      continue;
    }

    if (asset.status === 'queued') {
      counts.queued += 1;
    } else if (asset.status === 'generating') {
      counts.generating += 1;
    } else if (asset.status === 'failed') {
      counts.failed += 1;
    } else {
      counts.missing += 1;
    }
  }

  return {
    running: hasRunningJob(batchJobKey),
    concurrency: config.questionMediaBatchConcurrency,
    documentId: input.documentId || null,
    counts
  };
}

async function processQuestionMediaBatch(questionIds: number[], input: QueueQuestionMediaGenerationInput) {
  const pending = [...questionIds];
  const workerCount = Math.min(config.questionMediaBatchConcurrency, pending.length);

  async function worker() {
    while (pending.length) {
      const questionId = pending.shift();
      if (!questionId) {
        return;
      }

      try {
        await generateQuestionMedia(questionId, input);
      } catch (error) {
        await saveQuestionMediaAsset(questionId, {
          status: 'failed',
          errorMessage: (error as Error).message
        });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function generateQuestionMedia(questionId: number, input: QueueQuestionMediaGenerationInput) {
  const question = await getQuestionById(questionId);
  if (!question) {
    throw new Error('Question not found.');
  }

  const existing = await getQuestionMediaAssetByQuestionId(questionId);
  const voice = input.voice || config.openaiTtsVoice;
  const avatarName = input.avatarName || existing?.avatarName || 'default-interviewer';
  const instructions = input.instructions || config.openaiTtsInstructions;

  await saveQuestionMediaAsset(questionId, {
    status: 'generating',
    sourceText: question.prompt,
    voice,
    avatarName,
    instructions,
    imageUrl: resolveQuestionImageUrl(input, existing),
    videoUrl: input.videoUrl ?? existing?.videoUrl ?? (config.defaultQuestionVideoUrl || null),
    errorMessage: null
  });

  const audio = await ensureQuestionAudio(questionId, question.prompt, voice, instructions, input.force || false, existing);
  const imageUrl = resolveQuestionImageUrl(input, existing);
  const videoMustMatchAudio = Boolean(input.force || audio.regenerated);
  let videoUrl =
    input.videoUrl !== undefined
      ? input.videoUrl
      : videoMustMatchAudio
        ? config.defaultQuestionVideoUrl || null
        : existing?.videoUrl ?? (config.defaultQuestionVideoUrl || null);
  let videoProvider = videoUrl ? inferVisualProvider(input.videoUrl, existing?.videoUrl, config.defaultQuestionVideoUrl) : null;
  let videoErrorMessage: string | null = null;

  if (avatarVideoUnavailableReason && videoMustMatchAudio) {
    videoErrorMessage = avatarVideoUnavailableReason;
  } else if (
    config.didApiKey &&
    imageUrl &&
    audio.audioUrl &&
    input.videoUrl === undefined &&
    (!videoUrl || videoMustMatchAudio)
  ) {
    videoErrorMessage = await getAvatarVideoPreflightError(imageUrl, audio.audioUrl);
    if (!videoErrorMessage) {
      try {
        const videoResult = await generateAvatarVideo(questionId, imageUrl, audio.audioUrl);
        videoUrl = videoResult.videoUrl;
        videoProvider = videoResult.provider;
      } catch (e) {
        videoErrorMessage = (e as Error).message;
        if (isTerminalAvatarVideoError(videoErrorMessage)) {
          avatarVideoUnavailableReason = videoErrorMessage;
        }
        console.error(`Failed to generate avatar video for question ${questionId}:`, e);
      }
    }
  } else if (!config.didApiKey && imageUrl && audio.audioUrl && !videoUrl) {
    videoErrorMessage = 'DID_API_KEY is not configured; generated audio only.';
  }

  await saveQuestionMediaAsset(questionId, {
    status: 'ready',
    sourceText: question.prompt,
    audioPath: audio.audioPath,
    audioUrl: audio.audioUrl,
    imageUrl,
    videoUrl,
    voiceProvider: 'openai-tts',
    imageProvider: imageUrl ? inferVisualProvider(input.imageUrl, existing?.imageUrl, config.defaultQuestionImageUrl) : null,
    videoProvider,
    voice,
    avatarName,
    instructions,
    errorMessage: videoUrl ? null : videoErrorMessage
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
    if (hasMatchingVoiceConfiguration(existing, voice, instructions)) {
      return {
        audioPath: existing.audioPath,
        audioUrl: existing.audioUrl,
        regenerated: false
      };
    }
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
      audioUrl: ossUpload.url,
      regenerated: true
    };
  }

  return {
    audioPath: storedPath,
    audioUrl: resolvePublicAssetUrl(storedPath),
    regenerated: true
  };
}

function hasMatchingVoiceConfiguration(existing: QuestionMediaAssetRecord, voice: string, instructions: string) {
  if (existing.voiceProvider && existing.voiceProvider !== 'openai-tts') {
    return true;
  }

  return existing.voice === voice && existing.instructions === instructions;
}

function isTerminalAvatarVideoError(message: string) {
  return /(?:HTTP|failed:)\s*402\b|InsufficientCreditsError|not enough credits/i.test(message);
}

async function resolveBatchQuestionIds(input: BatchQuestionMediaGenerationInput) {
  if (input.questionIds?.length) {
    return Array.from(new Set(input.questionIds.filter((item) => Number.isInteger(item) && item > 0)));
  }

  if (!input.documentId) {
    const questions = await listAllQuestions();
    return questions.map((item) => item.id);
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

async function getAvatarVideoPreflightError(imageUrl: string, audioUrl: string) {
  const imageError = await validateFetchablePublicUrl(imageUrl, 'interviewer image');
  if (imageError) {
    return imageError;
  }

  return validateFetchablePublicUrl(audioUrl, 'question audio');
}

async function validateFetchablePublicUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return `${label} URL is invalid: ${value}`;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `${label} URL must be http or https for D-ID.`;
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return `${label} URL is local and cannot be fetched by D-ID. Configure PUBLIC_BASE_URL or OSS/CDN.`;
  }

  if (verifiedPublicUrls.has(value)) {
    return null;
  }

  let lastFailure = 'unknown error';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(value, {
        method: 'HEAD',
        signal: AbortSignal.timeout(config.questionMediaPreflightTimeoutMs)
      });
      if (response.ok || response.status === 405) {
        verifiedPublicUrls.add(value);
        return null;
      }

      lastFailure = `HTTP ${response.status}`;
      if (response.status < 500) {
        break;
      }
    } catch (error) {
      const cause = (error as Error & { cause?: unknown }).cause;
      lastFailure = cause instanceof Error ? `${(error as Error).message}: ${cause.message}` : (error as Error).message;
    }

    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  return `${label} URL is not publicly reachable: ${lastFailure}.`;
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

function resolveQuestionImageUrl(
  input: QueueQuestionMediaGenerationInput,
  existing: QuestionMediaAssetRecord | null | undefined
) {
  if (input.imageUrl !== undefined) {
    return input.imageUrl;
  }
  if (input.force) {
    return config.defaultQuestionImageUrl || null;
  }
  return existing?.imageUrl ?? (config.defaultQuestionImageUrl || null);
}

function buildQuestionAudioOssKey(questionId: number) {
  const parts = [config.ossPrefix || 'mock-interview', 'question-media', `question-${questionId}.mp3`];
  return parts.filter(Boolean).join('/');
}
