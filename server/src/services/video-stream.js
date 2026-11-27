import crypto from 'node:crypto';
import { config } from '../config.js';

function digest(assetId, expiresAt) {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`${assetId}.${expiresAt}`)
    .digest('base64url');
}

export function createVideoStreamUrl(assetId, ttlSeconds = 3600) {
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const token = digest(assetId, expiresAt);
  return `${config.publicBaseUrl.replace(/\/$/, '')}/v1/video-assets/${encodeURIComponent(assetId)}/stream.m3u8?expires=${expiresAt}&token=${encodeURIComponent(token)}`;
}

export function verifyVideoStreamToken(assetId, expiresAt, token) {
  const exp = Number(expiresAt);
  if (!Number.isInteger(exp) || exp < Math.floor(Date.now() / 1000) || !token) return false;
  const expected = digest(assetId, exp);
  const actualBuffer = Buffer.from(String(token));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
