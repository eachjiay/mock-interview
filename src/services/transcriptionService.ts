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
