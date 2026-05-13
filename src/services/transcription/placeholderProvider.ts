import type { TranscriptProviderName, TranscriptResult } from '../../types.js';
import type { TranscriptionProvider } from './types.js';

export class PlaceholderTranscriptionProvider implements TranscriptionProvider {
  constructor(
    readonly name: TranscriptProviderName,
    private readonly reason: string
  ) {}

  async transcribe(_audioPath: string): Promise<TranscriptResult> {
    throw new Error(this.reason);
  }
}
