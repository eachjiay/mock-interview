import type { TranscriptProviderName, TranscriptResult } from '../../types.js';

export interface TranscriptionProvider {
  readonly name: TranscriptProviderName;
  transcribe(audioPath: string): Promise<TranscriptResult>;
}
