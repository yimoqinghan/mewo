import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { errors } from './errors.js';

const ACCESS_TYPE = 'access';

/**
 * 选择 JWT 而不是 session，是为了让多端共用同一套鉴权：
 * 小程序、H5、App 都只是携带 Bearer token，服务端无状态，
 * 不需要为每个端维护 session 存储。
 */
export function signAccessToken(userId, client) {
  return jwt.sign({ sub: userId, typ: ACCESS_TYPE, cli: client || 'unknown' }, config.jwt.secret, {
    expiresIn: config.jwt.accessTtl,
    issuer: 'yanmiao'
  });
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.jwt.secret, { issuer: 'yanmiao' });
    if (payload.typ !== ACCESS_TYPE || !payload.sub) throw new Error('token 结构不合法');
    return payload;
  } catch {
    throw errors.unauthorized();
  }
}

export function accessTokenTtlSeconds() {
  // jsonwebtoken 解析 '2h' 这类字符串比较麻烦，这里只用于返回给客户端做提前刷新
  const raw = config.jwt.accessTtl;
  const match = /^(\d+)([smhd])$/.exec(raw);
  if (!match) return 7200;
  const value = Number(match[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  return value * unit;
}

/**
 * refresh token 使用不透明随机串 + 数据库存哈希。
 * 相比 JWT refresh，可以在服务端精确吊销单个设备。
 */
export function createRefreshToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function refreshExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + config.jwt.refreshTtlDays);
  return date;
}
