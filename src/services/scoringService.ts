import OpenAI from 'openai';
import { config } from '../config.js';
import { cleanTranscript } from './transcriptCleaningService.js';
import { analyzeAudioWithXunfei } from './xunfeiVoiceInsightService.js';
import type { AnalysisResult, ScoringProviderName } from '../types.js';

const client = config.openaiApiKey ? new OpenAI({ apiKey: config.openaiApiKey }) : null;

interface ScoreInput {
  questionText?: string;
  referenceText: string;
  transcriptText?: string;
  audioFileUrl?: string;
  scoringProvider?: ScoringProviderName;
}

export async function scoreTranscript(input: ScoreInput) {
  if (input.scoringProvider === 'xunfei') {
    return scoreWithXunfei(input);
  }
  return scoreWithOpenAI(input);
}

async function scoreWithOpenAI(input: ScoreInput) {
  if (!client) {
    throw new Error('OPENAI_API_KEY is required for scoring.');
  }
  if (!input.transcriptText) {
    throw new Error('transcriptText is required for OpenAI scoring.');
  }

  const cleanedTranscript = await cleanTranscript({
    transcriptText: input.transcriptText,
    keepParagraphs: true
  });

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
              answerText: cleanedTranscript.cleanedText,
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
      raw: {
        cleanedTranscript,
        scoringResponse: response
      }
    }
  };
}

async function scoreWithXunfei(input: ScoreInput) {
  if (!input.audioFileUrl) {
    throw new Error('audioFileUrl is required for Xunfei scoring.');
  }

  const response = await analyzeAudioWithXunfei({
    audioFileUrl: input.audioFileUrl,
    customizePrompt: buildXunfeiPrompt(input),
    taskName: '面试评分',
    enableSpeakerSeparation: true,
    fields: [
      { name: 'score', desc: '0到100的整数分数' },
      { name: 'summary', desc: '一句话中文总结' },
      { name: 'strengths', desc: '回答中的亮点，字符串数组' },
      { name: 'gaps', desc: '遗漏点，字符串数组' },
      { name: 'mismatches', desc: '与参考答案不一致或不准确的点，字符串数组' }
    ]
  });

  const parsed = extractStructuredAnalysis(response.subTaskResults.map((item) => item.result));
  const analysis = parsed || buildFallbackAnalysis(response);

  return {
    model: `xunfei-voice-insight:${config.xunfeiVoiceInsightModelCode}`,
    analysis: {
      ...analysis,
      raw: response
    }
  };
}

function buildXunfeiPrompt(input: ScoreInput) {
  const parts = [
    '你是技术面试评委。只评价候选人的回答，不评价面试官的提问或寒暄。',
    `面试题目：${input.questionText || '未提供'}`,
    `参考答案：${input.referenceText}`
  ];

  if (input.transcriptText) {
    parts.push(`已转写文本参考：${truncate(input.transcriptText, 1800)}`);
  }

  parts.push(
    '请输出严格 JSON，不要加 markdown。字段必须包含 score、summary、strengths、gaps、mismatches。',
    'score 为 0-100 数字；summary 为简短中文；其余三个字段为字符串数组。'
  );

  return parts.join('\n\n');
}

function extractStructuredAnalysis(candidates: unknown[]): AnalysisResult | null {
  for (const candidate of candidates) {
    const normalized = normalizeAnalysis(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function normalizeAnalysis(value: unknown): AnalysisResult | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    if (parsed) {
      return normalizeAnalysis(parsed);
    }

    const jsonMatch = value.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsedMatch = tryParseJson(jsonMatch[0]);
      if (parsedMatch) {
        return normalizeAnalysis(parsedMatch);
      }
    }

    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeAnalysis(item);
      if (normalized) {
        return normalized;
      }
    }
    return null;
  }

  if (typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directScore = firstNumber(record.score, record.finalScore, record.totalScore, record.rating);
  const directSummary = firstString(record.summary, record.comment, record.overview, record.desc);
  const directStrengths = toStringArray(record.strengths ?? record.advantages ?? record.highlights);
  const directGaps = toStringArray(record.gaps ?? record.missingPoints ?? record.weaknesses);
  const directMismatches = toStringArray(record.mismatches ?? record.errors ?? record.inconsistencies);

  if (directScore !== null || directSummary || directStrengths.length || directGaps.length || directMismatches.length) {
    return {
      score: clampScore(directScore ?? 0),
      summary: directSummary || '讯飞已完成分析，但未返回完整总结。',
      strengths: directStrengths,
      gaps: directGaps,
      mismatches: directMismatches
    };
  }

  for (const key of ['result', 'data', 'output', 'response', 'content', 'text']) {
    if (key in record) {
      const nested = normalizeAnalysis(record[key]);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function buildFallbackAnalysis(response: { transcriptText?: string; subTaskResults: Array<{ name: string; status: string; result: unknown }> }): AnalysisResult {
  const snippets = response.subTaskResults
    .map((item) => collectText(item.result))
    .filter(Boolean)
    .join('\n')
    .slice(0, 280);

  return {
    score: 0,
    summary: snippets || '讯飞已返回分析结果，但暂时没解析出结构化评分。',
    strengths: [],
    gaps: [],
    mismatches: []
  };
}

function collectText(value: unknown): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map(collectText).filter(Boolean).join(' ');
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map(collectText).filter(Boolean).join(' ');
  }
  return '';
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) {
      return numberValue;
    }
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function toStringArray(value: unknown) {
  if (!value) {
    return [] as string[];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,，;；]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [] as string[];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function truncate(text: string, maxLength: number) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}
