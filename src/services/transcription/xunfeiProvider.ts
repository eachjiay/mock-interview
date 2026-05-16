import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import iconv from 'iconv-lite';
import { config } from '../../config.js';
import type { TranscriptResult } from '../../types.js';
import type { TranscriptionProvider } from './types.js';

interface XunfeiUploadResponse {
  code: string;
  descInfo: string;
  content?: {
    orderId: string;
    taskEstimateTime?: number;
  };
}

interface XunfeiResultResponse {
  code: string;
  descInfo: string;
  content?: {
    orderInfo?: {
      status: number;
      failType?: number;
      originalDuration?: number;
    };
    orderResult?: string;
    taskEstimateTime?: number;
  };
}

const STATUS_SUCCESS = 4;
const STATUS_FAILED = -1;
const STATUS_PROCESSING = new Set([0, 1, 2, 3]);

export class XunfeiTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'xunfei' as const;

  constructor() {
    if (!config.xunfeiEnabled) {
      throw new Error('XUNFEI_ENABLED is false. Enable it before using the Xunfei transcription provider.');
    }
    if (!config.xunfeiAppId || !config.xunfeiApiKey || !config.xunfeiApiSecret) {
      throw new Error('XUNFEI_APP_ID, XUNFEI_API_KEY, and XUNFEI_API_SECRET are required for the Xunfei transcription provider.');
    }
  }

  async transcribe(audioPath: string): Promise<TranscriptResult> {
    const stat = await fs.stat(audioPath);
    if (stat.size > 500 * 1024 * 1024) {
      throw new Error('Xunfei recording-file transcription supports files up to 500 MB.');
    }

    const fileName = path.basename(audioPath);
    const signatureRandom = randomString(16);
    const uploadQuery = this.buildUploadQuery({
      fileName,
      fileSize: String(stat.size),
      signatureRandom
    });
    const uploadResponse = await fetch(`${config.xunfeiApiUrl}/v2/upload?${buildQueryString(uploadQuery)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        signature: signParams(uploadQuery, config.xunfeiApiSecret)
      },
      body: await fs.readFile(audioPath)
    });

    const uploadPayload = (await uploadResponse.json()) as XunfeiUploadResponse;
    assertXunfeiSuccess(uploadPayload, 'upload');
    const orderId = uploadPayload.content?.orderId;
    if (!orderId) {
      throw new Error('Xunfei upload did not return orderId.');
    }

    const startedAt = Date.now();
    let lastPayload: XunfeiResultResponse | null = null;
    while (Date.now() - startedAt < config.xunfeiPollTimeoutMs) {
      const query = this.buildResultQuery({ orderId, signatureRandom });
      const resultResponse = await fetch(`${config.xunfeiApiUrl}/v2/getResult?${buildQueryString(query)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          signature: signParams(query, config.xunfeiApiSecret)
        },
        body: '{}'
      });

      const payload = (await resultResponse.json()) as XunfeiResultResponse;
      assertXunfeiSuccess(payload, 'getResult');
      lastPayload = payload;

      const status = payload.content?.orderInfo?.status;
      if (status === STATUS_SUCCESS) {
        const text = parseOrderResult(payload.content?.orderResult || '');
        return {
          provider: this.name,
          model: 'xfyun-recording-file-llm',
          text,
          durationSeconds: payload.content?.orderInfo?.originalDuration
            ? Number((payload.content.orderInfo.originalDuration / 1000).toFixed(2))
            : undefined,
          raw: payload
        };
      }

      if (status === STATUS_FAILED) {
        throw new Error(`Xunfei transcription failed for order ${orderId}.`);
      }

      if (!STATUS_PROCESSING.has(Number(status))) {
        throw new Error(`Unexpected Xunfei order status: ${String(status)}`);
      }

      const waitMs = payload.content?.taskEstimateTime
        ? Math.max(config.xunfeiPollIntervalMs, Math.min(payload.content.taskEstimateTime, 15000))
        : config.xunfeiPollIntervalMs;
      await sleep(waitMs);
    }

    throw new Error(`Xunfei transcription timed out for order ${orderId}. Last payload: ${JSON.stringify(lastPayload)}`);
  }

  private buildUploadQuery(input: { fileName: string; fileSize: string; signatureRandom: string }) {
    return {
      appId: config.xunfeiAppId,
      accessKeyId: config.xunfeiApiKey,
      dateTime: formatXunfeiDate(new Date()),
      signatureRandom: input.signatureRandom,
      fileSize: input.fileSize,
      fileName: input.fileName,
      durationCheckDisable: 'true',
      language: config.xunfeiLanguage
    };
  }

  private buildResultQuery(input: { orderId: string; signatureRandom: string }) {
    return {
      accessKeyId: config.xunfeiApiKey,
      dateTime: formatXunfeiDate(new Date()),
      signatureRandom: input.signatureRandom,
      orderId: input.orderId,
      resultType: 'transfer'
    };
  }
}

function parseOrderResult(raw: string) {
  if (!raw) {
    return '';
  }

  const parsed = JSON.parse(raw) as {
    lattice?: Array<{
      json_1best?: string;
    }>;
  };

  const fragments: string[] = [];
  for (const latticeItem of parsed.lattice || []) {
    if (!latticeItem.json_1best) {
      continue;
    }
    const best = JSON.parse(latticeItem.json_1best) as {
      st?: {
        rt?: Array<{
          ws?: Array<{
            cw?: Array<{
              w?: string;
            }>;
          }>;
        }>;
      };
    };

    for (const rt of best.st?.rt || []) {
      for (const ws of rt.ws || []) {
        const word = ws.cw?.[0]?.w;
        if (word) {
          fragments.push(repairPossiblyMojibake(word));
        }
      }
    }
  }

  return fragments.join('');
}

function repairPossiblyMojibake(value: string) {
  if (!value || !looksLikeMojibake(value)) {
    return value;
  }

  try {
    const repaired = iconv.decode(iconv.encode(value, 'gbk'), 'utf8');
    return scoreChineseText(repaired) > scoreChineseText(value) ? repaired : value;
  } catch {
    return value;
  }
}

function looksLikeMojibake(value: string) {
  return /[€鍙鍚鍛鐨勬浣浠璇闈㈤銆锛]/.test(value);
}

function scoreChineseText(value: string) {
  const commonChars = '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等';
  const suspiciousChars = '鍙鍚鍛鐨勬浣浠璇闈㈤銆锛€';

  let score = 0;
  for (const char of value) {
    if (commonChars.includes(char)) {
      score += 3;
    } else if (/[\u4e00-\u9fff]/.test(char)) {
      score += 1;
    }

    if (suspiciousChars.includes(char)) {
      score -= 2;
    }
  }

  return score;
}

function assertXunfeiSuccess(payload: { code?: string; descInfo?: string }, stage: string) {
  if (payload.code !== '000000') {
    throw new Error(`Xunfei ${stage} failed: ${payload.descInfo || payload.code || 'unknown error'}`);
  }
}

function signParams(params: Record<string, string>, secret: string) {
  const baseString = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return crypto.createHmac('sha1', secret).update(baseString, 'utf8').digest('base64');
}

function buildQueryString(params: Record<string, string>) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function formatXunfeiDate(date: Date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHoursPart = String(Math.floor(absMinutes / 60)).padStart(2, '0');
  const offsetMinutesPart = String(absMinutes % 60).padStart(2, '0');

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${sign}${offsetHoursPart}${offsetMinutesPart}`;
}

function randomString(length: number) {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
