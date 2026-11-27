import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../../config.js';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const script = fileURLToPath(new URL('./process.py', import.meta.url));
export function stickerRuntime() {
  const python = config.sticker.python || path.join(root, '.venv-sticker/bin/python');
  const modelDir = config.sticker.modelDir || path.join(root, '.models');
  return { python, modelDir, ready: existsSync(python) && existsSync(path.join(modelDir, `${config.sticker.model}.onnx`)) };
}
const messages = { INVALID_IMAGE: '照片无法读取，请换一张 JPG、PNG 或 WebP', NO_SUBJECT: '没找到清晰的宠物轮廓，试试主体完整、背景简单的照片', STICKER_UNAVAILABLE: '贴纸服务正在准备，请稍后再试', STICKER_TIMEOUT: '抠图超时，请换一张更清晰的照片重试', STICKER_FAILED: '这张照片暂时没能处理好，请重试' };
export function processSticker(buffer) {
  const runtime = stickerRuntime();
  if (!runtime.ready) return Promise.reject(Object.assign(new Error(messages.STICKER_UNAVAILABLE), { code: 'STICKER_UNAVAILABLE' }));
  return new Promise((resolve, reject) => {
    const child = spawn(runtime.python, [script], { env: { ...process.env, U2NET_HOME: runtime.modelDir, STICKER_MODEL: config.sticker.model, OMP_NUM_THREADS: '2', NUMBA_NUM_THREADS: '2' }, stdio: ['pipe','pipe','pipe'] });
    let parts = [], bytes = 0, stderr = '', expired = false, finished = false;
    const finish = (code, output) => { if (finished) return; finished = true; clearTimeout(timer); if (code) reject(Object.assign(new Error(messages[code] || messages.STICKER_FAILED), { code })); else resolve(output); };
    const timer = setTimeout(() => { expired = true; child.kill('SIGKILL'); }, config.sticker.timeoutMs);
    child.stdout.on('data', part => { bytes += part.length; if (bytes > 12*1024*1024) child.kill('SIGKILL'); else parts.push(part); });
    child.stderr.on('data', part => { stderr = (stderr + part.toString()).slice(-4000); });
    child.on('error', () => finish('STICKER_UNAVAILABLE'));
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (expired) return finish('STICKER_TIMEOUT');
      if (code !== 0) { const match = stderr.match(/"code":\s*"([A-Z_]+)"/); return finish(match ? match[1] : 'STICKER_FAILED'); }
      const result = Buffer.concat(parts);
      if (!result.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return finish('STICKER_FAILED');
      finish(null, result);
    });
    child.stdin.end(buffer);
  });
}
