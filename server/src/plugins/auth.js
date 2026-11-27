import { errors } from '../lib/errors.js';
import { getUserById } from '../services/identity.js';
import { verifyAccessToken } from '../lib/tokens.js';

const USER_CACHE_TTL_MS = Math.max(0, Number(process.env.AUTH_USER_CACHE_TTL_MS ?? 30000) || 0);
const USER_CACHE_MAX = 1000;
const userCache = new Map();

export function invalidateAuthUserCache(userId) {
  if (userId) userCache.delete(userId);
}

async function loadCachedUser(userId) {
  if (USER_CACHE_TTL_MS <= 0) return getUserById(userId);
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.user;
  }
  const user = await getUserById(userId);
  if (user) {
    if (userCache.size >= USER_CACHE_MAX) {
      const oldestKey = userCache.keys().next().value;
      if (oldestKey !== undefined) userCache.delete(oldestKey);
    }
    userCache.set(userId, { user, expiresAt: now + USER_CACHE_TTL_MS });
  } else {
    userCache.delete(userId);
  }
  return user;
}

/**
 * 鉴权装饰器。所有需要登录的路由在 preHandler 里挂 app.authenticate。
 * 直接 decorate 到根实例，不做插件封装，避免子实例拿不到装饰器。
 */
export async function registerAuth(app) {
  app.decorate('authenticate', async function authenticate(request) {
    const header = request.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw errors.unauthorized();

    const payload = verifyAccessToken(token);
    const user = await loadCachedUser(payload.sub);
    if (!user) throw errors.unauthorized();
    if (user.status !== 'active') throw errors.forbidden('账号已被停用');

    // 客户端类型从请求头取，用于区分微信 / 抖音 / H5 来源
    request.user = user;
    request.client = request.headers['x-client'] || 'unknown';
  });
}
