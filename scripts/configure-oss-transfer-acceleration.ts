import { createRequire } from 'node:module';
import OSS from 'ali-oss';
import { config } from '../src/config.js';

if (!config.ossBucket || !config.ossRegion || !config.ossAccessKeyId || !config.ossAccessKeySecret) {
  throw new Error('OSS configuration is incomplete.');
}

const client = new OSS({
  region: config.ossRegion,
  bucket: config.ossBucket,
  endpoint: config.ossEndpoint || undefined,
  accessKeyId: config.ossAccessKeyId,
  accessKeySecret: config.ossAccessKeySecret,
  secure: config.ossSecure,
  authorizationV4: true,
  timeout: 30000
});

const body = Buffer.from(
  '<TransferAccelerationConfiguration><Enabled>true</Enabled></TransferAccelerationConfiguration>'
);
const require = createRequire(import.meta.url);
const { createRequest } = require('../node_modules/ali-oss/lib/common/utils/createRequest.js') as {
  createRequest: (this: OSS, params: Record<string, unknown>) => {
    url: string;
    params: { headers: Record<string, string> };
  };
};
const signedRequest = createRequest.call(client, {
  method: 'PUT',
  bucket: config.ossBucket,
  subres: 'transferAcceleration',
  content: body,
  headers: { 'Content-Type': 'application/xml' }
});

const response = await fetch(signedRequest.url, {
  method: 'PUT',
  headers: signedRequest.params.headers,
  body,
  signal: AbortSignal.timeout(30000)
});
const responseBody = await response.text();

if (!response.ok) {
  throw new Error(`OSS transfer acceleration update failed: ${response.status} ${responseBody}`);
}

console.log(`OSS transfer acceleration enabled: HTTP ${response.status}`);
