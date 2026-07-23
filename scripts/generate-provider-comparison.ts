import fs from 'node:fs/promises';
import path from 'node:path';
import { Signer } from '@volcengine/openapi';
import { config } from '../src/config.js';
import { uploadBufferToOss } from '../src/services/ossStorageService.js';

const questionId = 375;
const comparisonVariant = (process.env.COMPARISON_VARIANT || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
const variantSuffix = comparisonVariant ? `-${comparisonVariant}` : '';
const didVariant = (process.env.DID_VARIANT || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
const didVariantSuffix = didVariant ? `-${didVariant}` : '';
const comparisonDir = path.join(process.cwd(), 'test-data');
const audioPath = path.join(comparisonDir, 'female-interviewer-marin.mp3');
const didOutputPath = path.join(
  comparisonDir,
  `question-${questionId}-did${didVariantSuffix}-comparison.mp4`
);
const volcengineOutputPath = path.join(
  comparisonDir,
  `question-${questionId}-volcengine${variantSuffix}-comparison.mp4`
);
const metadataPath = path.join(
  comparisonDir,
  `question-${questionId}-provider-comparison${variantSuffix}.json`
);
const audioObjectKey = `${config.ossPrefix}/comparisons/question-${questionId}-female-source.mp3`;
const didObjectKey = `${config.ossPrefix}/comparisons/question-${questionId}-did${didVariantSuffix}.mp4`;
const volcengineObjectKey = `${config.ossPrefix}/comparisons/question-${questionId}-volcengine${variantSuffix}.mp4`;

const reuseDIdVideo = process.env.REUSE_DID_VIDEO === 'true';
const reusePublishedAssets = process.env.REUSE_PUBLISHED_ASSETS === 'true';
const didOnly = process.env.DID_ONLY === 'true';
const didApiKey = reuseDIdVideo ? '' : requiredEnv('DID_API_KEY');
const volcengineAccessKey = didOnly ? '' : requiredEnv('VOLCENGINE_ACCESS_KEY');
const volcengineSecretKey = didOnly ? '' : requiredEnv('VOLCENGINE_SECRET_KEY');

if (!config.defaultQuestionImageUrl) {
  throw new Error('DEFAULT_QUESTION_IMAGE_URL is required.');
}

if (process.env.VOLCENGINE_CHECK_ONLY === 'true') {
  const check = await callVolcengine('JimengRealmanAvatarPictureOmniV15GetResult', {
    req_key: 'jimeng_realman_avatar_picture_omni_v15',
    task_id: '0'
  });
  console.log(`Volcengine access check: ${JSON.stringify(check)}`);
  await sleep(1000);
  process.exit(0);
}

if (process.env.VOLCENGINE_CHECK_LIP_SYNC === 'true') {
  const check = await callVolcengine('RealmanChangeLipsGetResult', {
    req_key: 'realman_change_lips',
    task_id: '0'
  });
  console.log(`Volcengine lip-sync access check: ${JSON.stringify(check)}`);
  await sleep(1000);
  process.exit(0);
}

if (process.env.VOLCENGINE_CHECK_IMAGE === 'true') {
  const check = await callVolcengine('JimengRealmanAvatarPictureCreateRoleOmniV15SubmitTask', {
    req_key: 'jimeng_realman_avatar_picture_create_role_omni_v15',
    image_url: config.defaultQuestionImageUrl
  });
  console.log(`Volcengine image check: ${JSON.stringify(check)}`);
  await sleep(1000);
  process.exit(0);
}

await fs.mkdir(comparisonDir, { recursive: true });

const audioBuffer = await fs.readFile(audioPath);
const audioUpload = reusePublishedAssets
  ? { url: publishedObjectUrl(audioObjectKey) }
  : await uploadBufferToOss(audioObjectKey, audioBuffer, 'audio/mpeg');

console.log(`Audio ready: ${audioUpload.url}`);

let didTaskId = 'reused-local-video';
let didVideo: Buffer;
if (reuseDIdVideo) {
  didVideo = await fs.readFile(didOutputPath);
  console.log(`Reusing D-ID video: ${didOutputPath}`);
} else {
  const existingDIdTaskId = process.env.DID_TASK_ID?.trim();
  if (existingDIdTaskId) {
    didTaskId = existingDIdTaskId;
    console.log(`Reusing D-ID task: ${didTaskId}`);
  } else {
    const credits = await getDIdCredits();
    console.log(`D-ID credits: remaining=${credits.remaining ?? 'unknown'}, total=${credits.total ?? 'unknown'}`);

    const didTalk = await createDIdTalk(config.defaultQuestionImageUrl, audioUpload.url);
    didTaskId = didTalk.id;
    console.log(`D-ID task created: ${didTaskId}`);
  }

  const didResultUrl = await waitForDIdTalk(didTaskId);
  didVideo = await downloadBuffer(didResultUrl, 'D-ID video');
  await fs.writeFile(didOutputPath, didVideo);
}
const didUpload = reusePublishedAssets
  && reuseDIdVideo
  ? { url: publishedObjectUrl(didObjectKey) }
  : await uploadBufferToOss(didObjectKey, didVideo, 'video/mp4');
console.log(`D-ID video ready: ${didUpload.url}`);

if (didOnly) {
  await sleep(1000);
  process.exit(0);
}

const existingVolcengineTaskId = process.env.VOLCENGINE_TASK_ID?.trim();
const volcengineTaskId =
  existingVolcengineTaskId ||
  (await submitVolcengineOmniHuman(config.defaultQuestionImageUrl, audioUpload.url));
console.log(
  existingVolcengineTaskId
    ? `Reusing Volcengine OmniHuman1.5 task: ${volcengineTaskId}`
    : `Volcengine OmniHuman1.5 task created: ${volcengineTaskId}`
);

const volcengineResultUrl = await waitForVolcengineOmniHuman(volcengineTaskId);
const volcengineVideo = await downloadBuffer(volcengineResultUrl, 'Volcengine video');
await fs.writeFile(volcengineOutputPath, volcengineVideo);
const volcengineUpload = await uploadBufferToOss(
  volcengineObjectKey,
  volcengineVideo,
  'video/mp4'
);
console.log(`Volcengine video ready: ${volcengineUpload.url}`);

await fs.writeFile(
  metadataPath,
  JSON.stringify(
    {
      questionId,
      variant: comparisonVariant || 'default',
      sourceImageUrl: config.defaultQuestionImageUrl,
      sourceAudioUrl: audioUpload.url,
      did: {
        localPath: path.relative(process.cwd(), didOutputPath),
        publicUrl: didUpload.url,
        taskId: didTaskId
      },
      volcengine: {
        model: 'OmniHuman1.5',
        localPath: path.relative(process.cwd(), volcengineOutputPath),
        publicUrl: volcengineUpload.url,
        taskId: volcengineTaskId
      },
      createdAt: new Date().toISOString()
    },
    null,
    2
  )
);

console.log(`Comparison metadata: ${metadataPath}`);

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function publishedObjectUrl(objectKey: string) {
  if (!config.ossPublicBaseUrl) {
    throw new Error('OSS_PUBLIC_BASE_URL is required when reusing published assets.');
  }
  return `${config.ossPublicBaseUrl}/${objectKey}`;
}

async function getDIdCredits() {
  const response = await fetch('https://api.d-id.com/credits', {
    headers: {
      Authorization: `Basic ${didApiKey}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`D-ID credits failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { remaining?: number; total?: number };
}

async function createDIdTalk(imageUrl: string, audioUrl: string) {
  const response = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${didApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source_url: imageUrl,
      driver_url: process.env.DID_DRIVER_URL || 'bank://lively/driver-06',
      script: {
        type: 'audio',
        audio_url: audioUrl
      },
      config: {
        fluent: true,
        pad_audio: Number(process.env.DID_PAD_AUDIO ?? 1.0),
        stitch: true,
        motion_factor: Number(process.env.DID_MOTION_FACTOR || 0.75)
      },
      name: `mock-interview-question-${questionId}${didVariantSuffix}-comparison`
    })
  });

  if (!response.ok) {
    throw new Error(`D-ID create talk failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as { id: string };
}

async function waitForDIdTalk(talkId: string) {
  for (let attempt = 1; attempt <= 90; attempt++) {
    await sleep(4000);
    const response = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      headers: {
        Authorization: `Basic ${didApiKey}`,
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`D-ID status failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as {
      status?: string;
      result_url?: string;
      error?: unknown;
    };

    if (data.status === 'done' && data.result_url) {
      return data.result_url;
    }
    if (data.status === 'error') {
      throw new Error(`D-ID generation failed: ${JSON.stringify(data.error ?? data)}`);
    }
    if (attempt % 5 === 0) {
      console.log(`D-ID status: ${data.status ?? 'unknown'} (${attempt}/90)`);
    }
  }

  throw new Error('D-ID generation timed out.');
}

async function submitVolcengineOmniHuman(imageUrl: string, audioUrl: string) {
  const result = await callVolcengine('JimengRealmanAvatarPictureOmniV15SubmitTask', {
    req_key: 'jimeng_realman_avatar_picture_omni_v15',
    image_url: imageUrl,
    audio_url: audioUrl,
    prompt:
      '固定机位，人物像证件照一样保持静止。头部、颈部、肩膀、上半身和头发都不移动，不点头，不摇头，不前后晃动，不做手势。全程保持专业中性表情，只允许嘴唇小幅、准确地随语音开合，下巴几乎不动，偶尔自然眨眼。说完后嘴角非常轻微上扬，然后保持静止。',
    seed: Number(process.env.VOLCENGINE_OMNI_SEED || questionId),
    pe_fast_mode: false
  });

  if (result.code !== 10000 || !result.data?.task_id) {
    throw new Error(`Volcengine submit failed: ${JSON.stringify(result)}`);
  }

  return String(result.data.task_id);
}

async function waitForVolcengineOmniHuman(taskId: string) {
  for (let attempt = 1; attempt <= 180; attempt++) {
    await sleep(10000);
    let result: VolcengineResponse;
    try {
      result = await callVolcengine('JimengRealmanAvatarPictureOmniV15GetResult', {
        req_key: 'jimeng_realman_avatar_picture_omni_v15',
        task_id: taskId
      });
    } catch (error) {
      console.log(
        `Volcengine polling network error (${attempt}/180): ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }

    if (result.code !== 10000) {
      throw new Error(`Volcengine status failed: ${JSON.stringify(result)}`);
    }

    const data = result.data ?? {};
    const responseData = parseResponseData(data.resp_data);
    const status = String(data.status ?? responseData.status ?? 'processing');
    const videoUrl = findVideoUrl(data) ?? findVideoUrl(responseData);

    if (videoUrl) {
      return String(videoUrl);
    }
    if (status === 'done' && responseData.code !== undefined && Number(responseData.code) !== 0) {
      throw new Error(`Volcengine generation failed: ${JSON.stringify(responseData)}`);
    }
    if (attempt % 3 === 0) {
      console.log(`Volcengine OmniHuman1.5 status: ${status} (${attempt}/180)`);
    }
  }

  throw new Error('Volcengine generation timed out.');
}

async function callVolcengine(action: string, body: Record<string, unknown>) {
  const method = 'POST';
  const host = 'visual.volcengineapi.com';
  const region = 'cn-beijing';
  const service = 'cv';
  const version = '2024-06-06';
  const payload = JSON.stringify(body);
  const request = {
    region,
    method,
    pathname: '/',
    params: { Action: action, Version: version },
    headers: {} as Record<string, string>,
    body: payload
  };
  const signer = new Signer(request, service);
  signer.addAuthorization({
    accessKeyId: volcengineAccessKey,
    secretKey: volcengineSecretKey
  });
  const query = new URLSearchParams(request.params).toString();

  const response = await fetch(`https://${host}/?${query}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...request.headers
    },
    body: payload
  });

  const text = await response.text();
  let data: VolcengineEnvelope;
  try {
    data = JSON.parse(text) as VolcengineEnvelope;
  } catch {
    throw new Error(`Volcengine returned non-JSON: ${response.status} ${text}`);
  }

  if (!response.ok) {
    throw new Error(`Volcengine HTTP ${response.status}: ${JSON.stringify(data)}`);
  }
  return data.Result ?? data;
}

function parseResponseData(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) {
    return {};
  }
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function findVideoUrl(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return /^https?:\/\//i.test(value) && /(?:\.mp4(?:\?|$)|video)/i.test(value)
      ? value
      : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findVideoUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ['video_url', 'url', 'preview_url', 'download_url']) {
    const found = findVideoUrl(record[key]);
    if (found) return found;
  }
  for (const nested of Object.values(record)) {
    const found = findVideoUrl(nested);
    if (found) return found;
  }
  return undefined;
}

async function downloadBuffer(url: string, label: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${label} download failed: ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      console.log(
        `${label} download network error (${attempt}/5): ${error instanceof Error ? error.message : String(error)}`
      );
      if (attempt < 5) {
        await sleep(attempt * 2000);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} download failed.`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface VolcengineResponse {
  code?: number;
  message?: string;
  request_id?: string;
  data?: {
    task_id?: string | number;
    status?: string;
    video_url?: string;
    resp_data?: string;
  };
}

interface VolcengineEnvelope extends VolcengineResponse {
  ResponseMetadata?: Record<string, unknown>;
  Result?: VolcengineResponse;
}
