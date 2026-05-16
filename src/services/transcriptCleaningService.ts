import OpenAI from 'openai';
import { config } from '../config.js';
import type { TranscriptCleanResult } from '../types.js';

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

interface CleanTranscriptInput {
  transcriptText: string;
  keepParagraphs?: boolean;
}

export async function cleanTranscript(input: CleanTranscriptInput) {
  if (!client) {
    throw new Error('OPENAI_API_KEY is required for transcript cleaning.');
  }

  const response = await client.responses.create({
    model: config.openaiScoringModel,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text:
              'You clean interview transcripts in Chinese. Remove filler words, fix punctuation, split paragraphs, normalize obvious ASR noise, keep the original meaning, and do not invent missing facts. Return strict JSON.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              transcriptText: input.transcriptText,
              keepParagraphs: input.keepParagraphs ?? true,
              outputSchema: {
                cleanedText: 'string',
                removedFillers: 'string[]',
                notes: 'string[]'
              }
            })
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'clean_transcript',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            cleanedText: { type: 'string' },
            removedFillers: {
              type: 'array',
              items: { type: 'string' }
            },
            notes: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['cleanedText', 'removedFillers', 'notes']
        }
      }
    }
  });

  const parsed = JSON.parse(response.output_text) as TranscriptCleanResult;
  return {
    cleanedText: parsed.cleanedText,
    removedFillers: parsed.removedFillers,
    notes: parsed.notes,
    raw: response
  };
}
