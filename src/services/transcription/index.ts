import { config } from '../../config.js';
import type { TranscriptProviderName } from '../../types.js';
import { OpenAITranscriptionProvider } from './openaiProvider.js';
import { PlaceholderTranscriptionProvider } from './placeholderProvider.js';
import type { TranscriptionProvider } from './types.js';
import { XunfeiTranscriptionProvider } from './xunfeiProvider.js';

export function getTranscriptionProvider(name: TranscriptProviderName): TranscriptionProvider {
  switch (name) {
    case 'openai':
      return new OpenAITranscriptionProvider();
    case 'xunfei':
      return new XunfeiTranscriptionProvider();
    case 'volcengine':
      return new PlaceholderTranscriptionProvider(
        'volcengine',
        config.volcengineEnabled
          ? 'Volcengine provider is enabled but not wired yet. Fill in the concrete request signing flow before using it.'
          : 'VOLCENGINE_ENABLED is false. Enable it and implement the provider request flow to compare with OpenAI.'
      );
    default:
      throw new Error(`Unsupported transcription provider: ${name}`);
  }
}

export function parseProviderList(input: unknown) {
  if (!input) {
    return ['openai'] as TranscriptProviderName[];
  }
  if (Array.isArray(input)) {
    return input as TranscriptProviderName[];
  }
  return String(input)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean) as TranscriptProviderName[];
}
