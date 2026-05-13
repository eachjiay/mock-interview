import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import type { TranscriptResult } from '../../types.js';
import type { TranscriptionProvider } from './types.js';

interface XunfeiResponse {
  ok: number;
  err_no: number;
  failed: string | null;
  data: string | null;
  task_id?: string;
}

interface XunfeiProgressData {
  status: number;
  desc?: string;
}

interface XunfeiAuthParams {
  app_id: string;
  ts: string;
  signa: string;
}

const STATUS_DONE = 9;

export class XunfeiTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'xunfei' as const;

  constructor() {
    if (!config.xunfeiEnabled) {
      throw new Error('XUNFEI_ENABLED is false. Enable it before using the Xunfei transcription provider.');
    }
    if (!config.xunfeiAppId || !config.xunfeiApiSecret) {
      throw new Error('XUNFEI_APP_ID and XUNFEI_API_SECRET are required for the Xunfei transcription provider.');
    }
  }

  async transcribe(audioPath: string): Promise<TranscriptResult> {
    const stat = await fs.stat(audioPath);
    if (stat.size > 500 * 1024 * 1024) {
      throw new Error('Xunfei long-form ASR only supports files up to 500 MB.');
    }

    const fileName = path.basename(audioPath);
    const sliceSize = config.xunfeiSliceSizeMb * 1024 * 1024;
    const sliceCount = Math.max(1, Math.ceil(stat.size / sliceSize));
    const auth = this.buildAuth();
    const taskId = await this.prepare(fileName, stat.size, sliceCount, auth);

    await this.uploadSlices(audioPath, taskId, sliceSize, auth);
    await this.merge(taskId, auth);
    const progress = await this.waitForCompletion(taskId, auth);
    const resultData = await this.getResult(taskId, auth);
    const parsedResult = this.parseJson(resultData) as Array<{ onebest?: string }>;
    const text = parsedResult
      .map((item) => item.onebest?.trim())
      .filter(Boolean)
      .join('\n');

    return {
      provider: this.name,
      model: 'xfyun-lfasr',
      text,
      raw: {
        taskId,
        progress,
        result: parsedResult
      }
    };
  }

  private buildAuth(): XunfeiAuthParams {
    const ts = Math.floor(Date.now() / 1000).toString();
    const md5 = crypto.createHash('md5').update(`${config.xunfeiAppId}${ts}`).digest('hex');
    const signa = crypto.createHmac('sha1', config.xunfeiApiSecret).update(md5).digest('base64');
    return {
      app_id: config.xunfeiAppId,
      ts,
      signa
    };
  }

  private async prepare(fileName: string, fileLength: number, sliceCount: number, auth: XunfeiAuthParams) {
    const response = await this.postForm('/prepare', {
      ...auth,
      file_len: String(fileLength),
      file_name: fileName,
      slice_num: String(sliceCount),
      lfasr_type: '0'
    });

    return response.data || response.task_id || '';
  }

  private async uploadSlices(audioPath: string, taskId: string, sliceSize: number, auth: XunfeiAuthParams) {
    const fileHandle = await fs.open(audioPath, 'r');
    const stat = await fileHandle.stat();
    try {
      const sliceIdGenerator = new SliceIdGenerator();
      for (let offset = 0; offset < stat.size; offset += sliceSize) {
        const currentSize = Math.min(sliceSize, stat.size - offset);
        const buffer = Buffer.alloc(currentSize);
        const { bytesRead } = await fileHandle.read(buffer, 0, currentSize, offset);
        const form = new FormData();
        form.set('app_id', auth.app_id);
        form.set('ts', auth.ts);
        form.set('signa', auth.signa);
        form.set('task_id', taskId);
        form.set('slice_id', sliceIdGenerator.next());
        form.set('content', new Blob([buffer.subarray(0, bytesRead)]), 'slice.bin');
        await this.postMultipart('/upload', form);
      }
    } finally {
      await fileHandle.close();
    }
  }

  private async merge(taskId: string, auth: XunfeiAuthParams) {
    await this.postForm('/merge', {
      ...auth,
      task_id: taskId
    });
  }

  private async waitForCompletion(taskId: string, auth: XunfeiAuthParams) {
    const start = Date.now();
    while (Date.now() - start < config.xunfeiPollTimeoutMs) {
      const progressResponse = await this.postForm('/getProgress', {
        ...auth,
        task_id: taskId
      });
      const progress = this.parseJson(progressResponse.data) as XunfeiProgressData;
      if (Number(progress.status) === STATUS_DONE) {
        return progress;
      }
      await sleep(config.xunfeiPollIntervalMs);
    }
    throw new Error(`Xunfei transcription timed out for task ${taskId}.`);
  }

  private async getResult(taskId: string, auth: XunfeiAuthParams) {
    const response = await this.postForm('/getResult', {
      ...auth,
      task_id: taskId
    });
    return response.data || '[]';
  }

  private async postForm(endpoint: string, params: Record<string, string>) {
    const response = await fetch(`${config.xunfeiApiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: new URLSearchParams(params)
    });
    return this.parseResponse(response);
  }

  private async postMultipart(endpoint: string, form: FormData) {
    const response = await fetch(`${config.xunfeiApiUrl}${endpoint}`, {
      method: 'POST',
      body: form
    });
    return this.parseResponse(response);
  }

  private async parseResponse(response: Response) {
    if (!response.ok) {
      throw new Error(`Xunfei API request failed with HTTP ${response.status}.`);
    }
    const payload = (await response.json()) as XunfeiResponse;
    if (payload.ok !== 0) {
      throw new Error(payload.failed || `Xunfei API error ${payload.err_no}`);
    }
    return payload;
  }

  private parseJson(raw: string | null) {
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  }
}

class SliceIdGenerator {
  private current = 'aaaaaaaaa`';

  next() {
    let value = this.current;
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const char = value[index] || 'a';
      if (char !== 'z') {
        value = `${value.slice(0, index)}${String.fromCharCode(char.charCodeAt(0) + 1)}${value.slice(index + 1)}`;
        this.current = value;
        return value;
      }
      value = `${value.slice(0, index)}a${value.slice(index + 1)}`;
    }
    this.current = value;
    return value;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
