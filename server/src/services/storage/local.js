import { mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../../config.js';
import { errors } from '../../lib/errors.js';

/**
 * 开发环境本地存储。仅在未配置 COS 时启用。
 * 用途：让购买 COS 之前的本地联调能跑通「上传 → 生成 → 出图」全链路。
 * 生产环境永远不会走到这里（config.cos.enabled 为 true 时由 COS 驱动）。
 */
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.storage'
);

function resolveSafe(objectKey) {
  const target = path.resolve(root, objectKey);
  // 防目录穿越：objectKey 来自服务端生成，但仍然显式校验
  if (!target.startsWith(root + path.sep)) {
    throw errors.badRequest('非法的对象键');
  }
  return target;
}

export async function signPutUrl({ objectKey }) {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  // 本地驱动没有真实签名，用一条独立路径接收上传
  return `${base}/dev-storage/${objectKey}`;
}

export async function signGetUrl(objectKey) {
  const base = config.publicBaseUrl.replace(/\/$/, '');
  return `${base}/dev-storage/${objectKey}`;
}

export function cdnUrl() {
  return null;
}

export async function putObject({ objectKey, buffer }) {
  const target = resolveSafe(objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return { Location: objectKey };
}

export async function headObject(objectKey) {
  const target = resolveSafe(objectKey);
  try {
    const info = await stat(target);
    return { headers: { 'content-length': String(info.size) } };
  } catch {
    throw errors.badRequest('文件不存在');
  }
}

export async function deleteObject(objectKey) {
  await rm(resolveSafe(objectKey), { force: true });
}

/** 供开发路由读取文件字节 */
export async function readLocalObject(objectKey) {
  return readFile(resolveSafe(objectKey));
}

export async function writeLocalObject(objectKey, buffer) {
  const target = resolveSafe(objectKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return { Location: objectKey };
}
