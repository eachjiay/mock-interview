import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { ensureParentDir } from '../utils/fs.js';
import { isOssConfigured, uploadBufferToOss } from './ossStorageService.js';

interface DIdTalksResponse {
  id: string;
  created_at: string;
  created_by: string;
  status: 'created' | 'started' | 'done' | 'error';
  object: string;
  result_url?: string;
}

export async function generateAvatarVideo(questionId: number, imageUrl: string, audioUrl: string) {
  if (!config.didApiKey) {
    throw new Error('DID_API_KEY is not configured');
  }

  // 1. Submit video generation task to D-ID
  const createResponse = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${config.didApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source_url: imageUrl,
      script: {
        type: 'audio',
        audio_url: audioUrl
      },
      config: {
        fluent: true,
        pad_audio: 0.0
      }
    })
  });

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(`D-ID create talk failed: ${createResponse.status} ${errorText}`);
  }

  const createData = (await createResponse.json()) as DIdTalksResponse;
  const talkId = createData.id;

  // 2. Poll for completion
  let resultUrl: string | undefined;
  let attempts = 0;
  const maxAttempts = 60; // 60 * 5s = 5 minutes max

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;

    const getResponse = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${config.didApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!getResponse.ok) {
      const errorText = await getResponse.text();
      throw new Error(`D-ID get talk status failed: ${getResponse.status} ${errorText}`);
    }

    const getData = (await getResponse.json()) as DIdTalksResponse;
    
    if (getData.status === 'done') {
      resultUrl = getData.result_url;
      break;
    } else if (getData.status === 'error') {
      throw new Error(`D-ID talk generation failed: ${JSON.stringify(getData)}`);
    }
    // else status is 'created' or 'started', keep polling
  }

  if (!resultUrl) {
    throw new Error('D-ID talk generation timed out');
  }

  // 3. Download the generated video
  const videoResponse = await fetch(resultUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download generated video from D-ID: ${videoResponse.status}`);
  }

  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const videoPath = path.join(config.questionMediaDir, `question-${questionId}.mp4`);
  await ensureParentDir(videoPath);
  await fs.writeFile(videoPath, videoBuffer);

  const storedPath = path.relative(process.cwd(), videoPath);

  // 4. Upload to OSS if configured
  if (isOssConfigured()) {
    const ossObjectKey = buildQuestionVideoOssKey(questionId);
    const ossUpload = await uploadBufferToOss(ossObjectKey, videoBuffer, 'video/mp4');
    return {
      videoPath: storedPath,
      videoUrl: ossUpload.url,
      provider: 'd-id'
    };
  }

  return {
    videoPath: storedPath,
    videoUrl: resolvePublicAssetUrl(storedPath),
    provider: 'd-id'
  };
}

function resolvePublicAssetUrl(storedPath: string) {
  if (!config.publicBaseUrl) {
    return null;
  }
  const normalized = storedPath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
  return `${config.publicBaseUrl}/${normalized}`;
}

function buildQuestionVideoOssKey(questionId: number) {
  const parts = [config.ossPrefix || 'mock-interview', 'question-media', `question-${questionId}.mp4`];
  return parts.filter(Boolean).join('/');
}
