import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import OpenAI from 'openai';
import { config } from '../../config.js';
import type { TranscriptResult } from '../../types.js';
import type { TranscriptionProvider } from './types.js';

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = 'openai' as const;
  private readonly client: OpenAI;

  constructor() {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY is required for the OpenAI transcription provider.');
    }
    this.client = new OpenAI({ apiKey: config.openaiApiKey });
  }

  async transcribe(audioPath: string): Promise<TranscriptResult> {
    const stat = await fsPromises.stat(audioPath);
    if (stat.size > 25 * 1024 * 1024) {
      throw new Error('OpenAI speech-to-text currently supports files up to 25 MB.');
    }

    const response = await this.client.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: config.openaiTranscriptionModel,
      response_format: 'json'
    });

    return {
      provider: this.name,
      model: config.openaiTranscriptionModel,
      text: response.text,
      raw: response
    };
  }
}
