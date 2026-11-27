import { ok, errors } from '../../lib/errors.js';
import { isLocalDriver } from '../../services/storage/index.js';
import { readLocalObject, writeLocalObject } from '../../services/storage/local.js';
import { issueTokens, getUserById, publicUser, resolveIdentity } from '../../services/identity.js';

/**
 * 仅开发环境注册的路由。生产环境不会加载。
 * 1) PUT /dev-storage/*：接收客户端直传文件，模拟 COS 预签名上传
 * 2) GET /dev-storage/*：返回文件，模拟签名读取
 * 3) POST /v1/auth/dev-login：跳过微信/抖音授权直接拿 token
 */

const MIME_BY_EXT = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  m3u8: 'application/vnd.apple.mpegurl',
  ts: 'video/mp2t'
};

export async function registerDevStorageRoutes(app) {
  if (!isLocalDriver) return;

  app.addContentTypeParser(
    ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body)
  );

  app.put('/dev-storage/*', { bodyLimit: 50 * 1024 * 1024 }, async (request, reply) => {
    const objectKey = request.params['*'];
    const body = request.body;
    if (!Buffer.isBuffer(body) || !body.length) {
      throw errors.badRequest('空文件');
    }
    await writeLocalObject(objectKey, body);
    return reply.code(200).send();
  });

  app.get('/dev-storage/*', async (request, reply) => {
    const objectKey = request.params['*'];
    const ext = objectKey.split('.').pop()?.toLowerCase() || '';
    try {
      const buffer = await readLocalObject(objectKey);
      return reply
        .header('content-type', MIME_BY_EXT[ext] || 'application/octet-stream')
        .header('cache-control', 'private, max-age=300')
        .send(buffer);
    } catch {
      throw errors.notFound('文件不存在');
    }
  });
}

/** 本地联调用登录接口：不校验微信 code，直接按 provider+uid 建号 */
export async function registerDevAuthRoutes(app) {
  app.post(
    '/dev-login',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['wechat_mp', 'douyin_mp', 'h5'] },
            uid: { type: 'string', minLength: 1 },
            phone: { type: 'string' },
            nickname: { type: 'string' }
          }
        }
      }
    },
    async (request) => {
      const provider = request.body.provider || 'h5';
      const uid = request.body.uid || `dev-${Date.now()}`;

      const result = await resolveIdentity({
        provider,
        providerUid: uid,
        phone: request.body.phone || null,
        profile: { nickname: request.body.nickname || '本地测试用户' },
        meta: { dev: true }
      });

      const user = await getUserById(result.userId);
      const tokens = await issueTokens(result.userId, 'dev');
      return ok({ ...tokens, user: publicUser(user) });
    }
  );
}
