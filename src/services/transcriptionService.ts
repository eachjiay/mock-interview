import fs from 'node:fs/promises';
import { config } from '../config.js';
import { getTranscriptionProvider } from './transcription/index.js';
import type { TranscriptProviderName, TranscriptResult } from '../types.js';

export async function transcribeAudioFile(audioPath: string, providers: TranscriptProviderName[]): Promise<TranscriptResult[]> {
  const results: TranscriptResult[] = [];

  for (const providerName of providers) {
    const provider = getTranscriptionProvider(providerName);
    const transcript = await provider.transcribe(audioPath);
    results.push(transcript);
  }

  return results;
}

export async function resolveTranscriptionProviders(audioPath: string, providerInput?: unknown): Promise<TranscriptProviderName[]> {
  if (providerInput) {
    const normalized = Array.isArray(providerInput)
      ? providerInput
      : String(providerInput)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);

    if (normalized.includes('auto')) {
      return autoSelectProviders(audioPath);
    }

    return normalized as TranscriptProviderName[];
  }

  return autoSelectProviders(audioPath);
}

async function autoSelectProviders(audioPath: string): Promise<TranscriptProviderName[]> {
  const stat = await fs.stat(audioPath);
  const sizeMb = stat.size / 1024 / 1024;

  if (sizeMb <= config.openaiMaxUploadMb) {
    return ['openai'];
  }

  if (config.xunfeiEnabled) {
    return ['xunfei'];
  }

  throw new Error(`Audio file is ${sizeMb.toFixed(2)} MB, exceeds OpenAI ${config.openaiMaxUploadMb} MB limit, and Xunfei is not enabled.`);
}
