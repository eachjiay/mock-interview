import OpenAI from 'openai';
import { config } from '../config.js';
import type { AnalysisResult } from '../types.js';

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

interface ScoreInput {
  questionText?: string;
  referenceText: string;
  transcriptText: string;
}

export async function scoreTranscript(input: ScoreInput) {
  if (!client) {
    throw new Error('OPENAI_API_KEY is required for scoring.');
  }

  const response = await client.responses.create({
    model: config.openaiScoringModel,
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: 'You are an interview evaluator. Score the answer against the reference text and return strict JSON.'
          }
        ]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              questionText: input.questionText || '',
              referenceText: input.referenceText,
              answerText: input.transcriptText,
              outputSchema: {
                score: 'number 0-100',
                summary: 'short Chinese summary',
                strengths: 'string[]',
                gaps: 'string[]',
                mismatches: 'string[]'
              }
            })
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'interview_score',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            score: { type: 'number' },
            summary: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            gaps: { type: 'array', items: { type: 'string' } },
            mismatches: { type: 'array', items: { type: 'string' } }
          },
          required: ['score', 'summary', 'strengths', 'gaps', 'mismatches']
        }
      }
    }
  });

  const jsonText = response.output_text;
  const parsed = JSON.parse(jsonText) as AnalysisResult;
  return {
    model: config.openaiScoringModel,
    analysis: {
      score: parsed.score,
      summary: parsed.summary,
      strengths: parsed.strengths,
      gaps: parsed.gaps,
      mismatches: parsed.mismatches,
      raw: response
    }
  };
}
