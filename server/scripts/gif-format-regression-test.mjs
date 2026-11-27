import assert from 'node:assert/strict';
import { detectMediaType } from '../src/services/media-format.js';

const GIF89A = Buffer.from('GIF89a', 'ascii');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// 生产故障回归：上游/CDN 将 GIF 字节误报为 image/png 时，不能把结果落成 PNG。
assert.equal(
  detectMediaType({ buffer: GIF89A, contentType: 'image/png' }),
  'image/gif'
);

// MIME 带 charset 等参数时，仍应得到稳定的标准类型。
assert.equal(
  detectMediaType({ buffer: PNG, contentType: 'image/png; charset=binary' }),
  'image/png'
);

// 反向保护：声明为 GIF 但实际是 PNG 时，不能生成一个伪 GIF 文件。
assert.equal(
  detectMediaType({ buffer: PNG, contentType: 'image/gif' }),
  'image/png'
);

assert.equal(
  detectMediaType({ buffer: Buffer.alloc(0), contentType: 'application/octet-stream', url: 'https://media.example.test/result.gif?token=redacted' }),
  'image/gif'
);

console.log('gif format regression: passed');
