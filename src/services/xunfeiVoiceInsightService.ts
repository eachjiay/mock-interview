import crypto from 'node:crypto';
import { config } from '../config.js';
import type { XunfeiVoiceInsightResult } from '../types.js';

interface CreateInsightTaskInput {
  audioFileUrl: string;
  customizePrompt: string;
  taskName?: string;
  fields?: Array<{ name: string; desc: string }>;
  enableSpeakerSeparation?: boolean;
}

interface CreateTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data?: {
    task_id: string;
    status: 'Running' | 'Finish' | 'Error';
    created_at: string;
  };
}

interface QueryTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data?: {
    task_id: string;
    status: 'Running' | 'Finish' | 'Error';
    created_at: string;
    content?: string;
    sub_task_results?: Array<{
      name?: string;
      status: string;
      result?: unknown;
    }>;
  };
}

const insightApiUrl = new URL(config.xunfeiVoiceInsightApiUrl);

export async function analyzeAudioWithXunfei(input: CreateInsightTaskInput): Promise<XunfeiVoiceInsightResult> {
  assertConfig();

  const task = await createTask(input);
  const taskId = task.data?.task_id;
  if (!taskId) {
    throw new Error('Xunfei voice insight did not return task_id.');
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < config.xunfeiPollTimeoutMs) {
    const query = await queryTask(taskId);
    const status = query.data?.status || 'Running';

    if (status === 'Finish' || status === 'Error') {
      return {
        taskId,
        status,
        transcriptText: query.data?.content,
        subTaskResults: (query.data?.sub_task_results || []).map((item) => ({
          name: item.name || 'unnamed-sub-task',
          status: item.status,
          result: item.result
        }))
      };
    }

    await sleep(config.xunfeiPollIntervalMs);
  }

  throw new Error(`Xunfei voice insight timed out for task ${taskId}.`);
}

async function createTask(input: CreateInsightTaskInput) {
  const body = {
    taskType: 'audioFile',
    audioFileUrl: input.audioFileUrl,
    modelCode: config.xunfeiVoiceInsightModelCode,
    audioParams: {
      vspp_on: input.enableSpeakerSeparation === false ? 0 : 1
    },
    subTasks: [
      {
        is_customize: true,
        name: input.taskName || '面试分析',
        customize_prompt: input.customizePrompt,
        fields: input.fields || []
      }
    ]
  };

  const bodyText = JSON.stringify(body);
  const requestPath = '/api/v1/voice-insight/create';
  const response = await fetch(new URL(requestPath, config.xunfeiVoiceInsightApiUrl), {
    method: 'POST',
    headers: buildAuthHeaders('POST', requestPath, bodyText),
    body: bodyText
  });

  const payload = (await response.json()) as CreateTaskResponse;
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Xunfei voice insight create failed: ${payload.message || payload.code || response.status}`);
  }
  return payload;
}

async function queryTask(taskId: string) {
  const requestPath = `/api/v1/voice-insight/tasks/${taskId}`;
  const response = await fetch(new URL(requestPath, config.xunfeiVoiceInsightApiUrl), {
    method: 'GET',
    headers: buildAuthHeaders('GET', requestPath)
  });

  const payload = (await response.json()) as QueryTaskResponse;
  if (!response.ok || payload.code !== 0) {
    throw new Error(`Xunfei voice insight query failed: ${payload.message || payload.code || response.status}`);
  }
  return payload;
}

function buildAuthHeaders(method: 'GET' | 'POST', requestPath: string, bodyText?: string) {
  const date = new Date().toUTCString();
  const requestLine = `${method} ${requestPath} HTTP/1.1`;
  const digest = bodyText
    ? `SHA-256=${crypto.createHash('sha256').update(bodyText).digest('base64')}`
    : '';

  const signingParts = [`host: ${insightApiUrl.host}`, `date: ${date}`];
  if (digest) {
    signingParts.push(`digest: ${digest}`);
  }
  signingParts.push(requestLine);

  const signature = crypto.createHmac('sha256', config.xunfeiApiSecret).update(signingParts.join('\n')).digest('base64');
  const signedHeaders = digest ? 'host date digest request-line' : 'host date request-line';
  const authorization = `api_key="${config.xunfeiApiKey}", algorithm="hmac-sha256", headers="${signedHeaders}", signature="${signature}"`;

  const headers: Record<string, string> = {
    Host: insightApiUrl.host,
    Date: date,
    Authorization: authorization,
    Accept: 'application/json',
    'X-Appid': config.xunfeiAppId
  };

  if (bodyText) {
    headers['Content-Type'] = 'application/json';
    headers.Digest = digest;
  }

  return headers;
}

function assertConfig() {
  if (!config.xunfeiAppId || !config.xunfeiApiKey || !config.xunfeiApiSecret) {
    throw new Error('XUNFEI_APP_ID, XUNFEI_API_KEY, and XUNFEI_API_SECRET are required for Xunfei voice insight.');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
