import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';

/**
 * 将模型返回的 MP4 打成点播 HLS。
 * 腾讯云点播支持 HLS 输出，但当前言喵的媒体账本基于 COS 对象键，
 * 因此这里在业务服务器完成封装，再把 m3u8 和 ts 一起放入 COS。
 */
export async function packageVideoToHls(buffer) {
  if (!config.ai.video.hls.enabled) return null;

  const workspace = await mkdtemp(path.join(os.tmpdir(), 'yanmiao-hls-'));
  const inputPath = path.join(workspace, 'input.mp4');
  const outputDir = path.join(workspace, 'hls');
  const playlistPath = path.join(outputDir, 'index.m3u8');
  await writeFile(inputPath, buffer);
  await mkdir(outputDir, { recursive: true });

  try {
    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a?',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-f', 'hls',
      '-hls_time', String(config.ai.video.hls.segmentSeconds),
      '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', path.join(outputDir, 'segment-%03d.ts'),
      playlistPath
    ];

    await new Promise((resolve, reject) => {
      const child = spawn(config.ai.video.hls.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('HLS 切片超时'));
      }, config.ai.video.hls.timeoutMs);
      child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        if (code === 0) return resolve();
        reject(new Error(`HLS 切片失败：${stderr.trim().slice(-500) || signal || code}`));
      });
    });

    const playlist = await readFile(playlistPath, 'utf8');
    const files = await readdir(outputDir);
    const segmentNames = files
      .filter((name) => /^segment-\d+\.ts$/i.test(name))
      .sort();
    if (!segmentNames.length) throw new Error('HLS 未生成 ts 切片');

    const segments = await Promise.all(segmentNames.map(async (name) => ({
      name,
      buffer: await readFile(path.join(outputDir, name))
    })));
    return { playlist, segments };
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}
