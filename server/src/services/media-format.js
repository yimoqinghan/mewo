const MIME_TYPES = new Set([
  'image/gif',
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4'
]);

export function normalizeMediaType(value) {
  const type = String(value || '').split(';', 1)[0].trim().toLowerCase();
  return MIME_TYPES.has(type) ? type : '';
}

function urlMediaType(url) {
  const value = String(url || '').toLowerCase();
  if (/\.gif(?:[?#]|$)/.test(value)) return 'image/gif';
  if (/\.(?:png|apng)(?:[?#]|$)/.test(value)) return 'image/png';
  if (/\.(?:jpe?g)(?:[?#]|$)/.test(value)) return 'image/jpeg';
  if (/\.webp(?:[?#]|$)/.test(value)) return 'image/webp';
  if (/\.mp4(?:[?#]|$)/.test(value)) return 'video/mp4';
  return '';
}

function sniffMediaType(buffer) {
  if (!Buffer.isBuffer(buffer)) return '';
  if (buffer.length >= 6 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return 'image/gif';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return 'video/mp4';
  }
  return '';
}

/**
 * 上游的 Content-Type 可能被 CDN 改写，生成结果必须优先按文件字节识别。
 * URL 和声明 MIME 只作为没有足够文件头时的兜底。
 */
export function detectMediaType({ buffer, contentType, url, requestedType } = {}) {
  return sniffMediaType(buffer)
    || urlMediaType(url)
    || normalizeMediaType(contentType)
    || normalizeMediaType(requestedType)
    || 'image/png';
}
