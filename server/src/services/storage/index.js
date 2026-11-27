import crypto from 'node:crypto';
import { config } from '../../config.js';
import * as cosDriver from '../cos.js';
import * as localDriver from './local.js';

/**
 * 存储驱动选择。业务代码只 import 这里，不直接依赖 COS SDK，
 * 这样后续换腾讯云其它存储、或加一个 OSS 备选都不用改业务逻辑。
 */
const driver = config.cos.enabled ? cosDriver : localDriver;

export const storageDriver = config.cos.enabled ? 'cos' : 'local';
export const isLocalDriver = !config.cos.enabled;

export const signPutUrl = (...args) => driver.signPutUrl(...args);
export const signGetUrl = (...args) => driver.signGetUrl(...args);
export const cdnUrl = (...args) => driver.cdnUrl?.(...args) || null;
export const putObject = (...args) => driver.putObject(...args);
export const headObject = (...args) => driver.headObject(...args);
export const deleteObject = (...args) => driver.deleteObject(...args);

/**
 * 对象键规范：
 *   u/{userId}/in/{yyyymm}/{uuid}.jpg     用户上传的原始素材
 *   u/{userId}/out/{yyyymm}/{uuid}.jpg    AI 生成结果
 *   u/{userId}/avatar/{uuid}.jpg          猫咪头像
 * 前缀带 userId，便于按用户做生命周期与权限管理。
 */
export function buildObjectKey({ userId, purpose, ext }) {
  const now = new Date();
  const month = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const folder = { input: 'in', output: 'out', avatar: 'avatar', voice: 'voice' }[purpose] || 'in';
  const id = crypto.randomUUID();
  return `u/${userId}/${folder}/${month}/${id}.${ext}`;
}

const MIME_EXT = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'application/vnd.apple.mpegurl': 'm3u8',
  'application/x-mpegurl': 'm3u8',
  'video/mp2t': 'ts',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/amr': 'amr'
};

export function extFromMime(mime) {
  return MIME_EXT[String(mime || '').split(';', 1)[0].trim().toLowerCase()] || 'jpg';
}
