import OSS from 'ali-oss';
import { config } from '../config.js';

const ossClient =
  config.ossEnabled && config.ossRegion && config.ossBucket && config.ossAccessKeyId && config.ossAccessKeySecret
    ? new OSS({
        region: config.ossRegion,
        bucket: config.ossBucket,
        endpoint: config.ossEndpoint || undefined,
        accessKeyId: config.ossAccessKeyId,
        accessKeySecret: config.ossAccessKeySecret,
        secure: config.ossSecure,
        authorizationV4: true,
        timeout: 180000
      })
    : null;

export function isOssConfigured() {
  return Boolean(ossClient);
}

export async function uploadBufferToOss(objectKey: string, buffer: Buffer, contentType: string) {
  if (!ossClient) {
    throw new Error('OSS is not configured.');
  }

  const normalizedKey = objectKey.replace(/^\/+/, '');
  const result = await ossClient.put(normalizedKey, buffer, {
    headers: {
      'Content-Type': contentType
    }
  });

  return {
    objectKey: normalizedKey,
    url: resolveOssPublicUrl(normalizedKey, result.url)
  };
}

function resolveOssPublicUrl(objectKey: string, fallbackUrl?: string) {
  if (config.ossPublicBaseUrl) {
    return `${config.ossPublicBaseUrl}/${objectKey}`;
  }
  if (fallbackUrl) {
    return fallbackUrl;
  }
  const endpointHost = config.ossEndpoint.replace(/^https?:\/\//, '');
  if (endpointHost) {
    const protocol = config.ossSecure ? 'https' : 'http';
    return `${protocol}://${config.ossBucket}.${endpointHost}/${objectKey}`;
  }
  return null;
}
