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
  port: Number(process.env.PORT || 5050),
  dbPath: resolvePath(process.env.DB_PATH, './data/app.json'),
  uploadDir: resolvePath(process.env.UPLOAD_DIR, './uploads'),
  maxAudioFileMb: Number(process.env.MAX_AUDIO_FILE_MB || 100),
  publicBaseUrl: normalizeBaseUrl(process.env.PUBLIC_BASE_URL),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiTranscriptionModel: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
  openaiScoringModel: process.env.OPENAI_SCORING_MODEL || 'gpt-4o-mini',
  openaiMaxUploadMb: Number(process.env.OPENAI_MAX_UPLOAD_MB || 25),
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
  volcengineSecretKey: process.env.VOLCENGINE_SECRET_KEY || ''
};
