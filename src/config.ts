import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const rootDir = process.cwd();

function resolvePath(value: string | undefined, fallback: string) {
  return path.isAbsolute(value || '') ? (value as string) : path.join(rootDir, value || fallback);
}

function normalizeBaseUrl(value: string | undefined) {
  return (value || '').trim().replace(/\/+$/, '');
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5050),
  dbPath: resolvePath(process.env.DB_PATH, './data/app.json'),
  uploadDir: resolvePath(process.env.UPLOAD_DIR, './uploads'),
  questionMediaDir: resolvePath(process.env.QUESTION_MEDIA_DIR, './uploads/question-media'),
  maxAudioFileMb: Number(process.env.MAX_AUDIO_FILE_MB || 100),
  adminApiToken: process.env.ADMIN_API_TOKEN || '',
  allowLocalImport: process.env.ALLOW_LOCAL_IMPORT === 'true' || process.env.NODE_ENV !== 'production',
  apiRateLimitWindowMs: Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60 * 1000),
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX || 120),
  paidApiRateLimitMax: Number(process.env.PAID_API_RATE_LIMIT_MAX || 20),
  questionMediaBatchConcurrency: Math.max(1, Number(process.env.QUESTION_MEDIA_BATCH_CONCURRENCY || 1)),
  questionMediaPreflightTimeoutMs: Math.max(1000, Number(process.env.QUESTION_MEDIA_PREFLIGHT_TIMEOUT_MS || 30000)),
  questionMediaAutoGenerateAll: process.env.QUESTION_MEDIA_AUTO_GENERATE_ALL === 'true',
  publicBaseUrl: normalizeBaseUrl(process.env.PUBLIC_BASE_URL),
  ossEnabled: process.env.OSS_ENABLED === 'true',
  ossRegion: process.env.OSS_REGION || '',
  ossBucket: process.env.OSS_BUCKET || '',
  ossEndpoint: process.env.OSS_ENDPOINT || '',
  ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  ossPrefix: (process.env.OSS_PREFIX || 'mock-interview').trim().replace(/^\/+|\/+$/g, ''),
  ossPublicBaseUrl: normalizeBaseUrl(process.env.OSS_PUBLIC_BASE_URL),
  ossSecure: process.env.OSS_SECURE !== 'false',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  openaiScoringModel: process.env.OPENAI_SCORING_MODEL || 'gpt-4o-mini',
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
  openaiTtsVoice: process.env.OPENAI_TTS_VOICE || 'marin',
  openaiTtsInstructions:
    process.env.OPENAI_TTS_INSTRUCTIONS ||
    'Speak in natural Mandarin Chinese using a warm, professional adult female voice. Sound calm, confident, and attentive, like an experienced interviewer. Use a moderate pace and clear pronunciation. Ask the question directly without adding or omitting content.',
  openaiMaxUploadMb: Number(process.env.OPENAI_MAX_UPLOAD_MB || 25),
  defaultQuestionImageUrl: normalizeBaseUrl(process.env.DEFAULT_QUESTION_IMAGE_URL),
  defaultQuestionVideoUrl: normalizeBaseUrl(process.env.DEFAULT_QUESTION_VIDEO_URL),
  xunfeiEnabled: process.env.XUNFEI_ENABLED === 'true',
  xunfeiApiUrl: process.env.XUNFEI_API_URL || 'https://office-api-ist-dx.iflyaisol.com',
  xunfeiAppId: process.env.XUNFEI_APP_ID || '',
  xunfeiApiKey: process.env.XUNFEI_API_KEY || '',
  xunfeiApiSecret: process.env.XUNFEI_API_SECRET || '',
  xunfeiLanguage: process.env.XUNFEI_LANGUAGE || 'autodialect',
  xunfeiPollIntervalMs: Number(process.env.XUNFEI_POLL_INTERVAL_MS || 5000),
  xunfeiPollTimeoutMs: Number(process.env.XUNFEI_POLL_TIMEOUT_MS || 15 * 60 * 1000),
  xunfeiVoiceInsightApiUrl: process.env.XUNFEI_VOICE_INSIGHT_API_URL || 'https://spark-openapi.cn-huabei-1.xf-yun.com',
  xunfeiVoiceInsightModelCode: process.env.XUNFEI_VOICE_INSIGHT_MODEL_CODE || '4.0ultra',
  volcengineEnabled: process.env.VOLCENGINE_ENABLED === 'true',
  volcengineApiUrl: process.env.VOLCENGINE_API_URL || '',
  volcengineAccessKey: process.env.VOLCENGINE_ACCESS_KEY || '',
  volcengineSecretKey: process.env.VOLCENGINE_SECRET_KEY || '',
  didApiKey: process.env.DID_API_KEY || ''
};
