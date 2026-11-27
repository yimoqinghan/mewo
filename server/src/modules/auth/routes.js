import { ok, errors } from '../../lib/errors.js';
import { query } from '../../db/pool.js';
import { hashToken } from '../../lib/tokens.js';
import { code2Session as wxCode2Session, getPhoneByCode as wxPhoneByCode } from '../../services/wechat.js';
import { code2Session as dyCode2Session } from '../../services/douyin.js';
import {
  resolveIdentity,
  bindVerifiedPhone,
  issueTokens,
  getUserById,
  listIdentities,
  publicUser
} from '../../services/identity.js';
import { getQuota } from '../../services/quota.js';

const loginResponse = async (userId, client, loginMeta = {}) => {
  const user = await getUserById(userId);
  const tokens = await issueTokens(userId, client);
  return ok({
    ...tokens,
    user: publicUser(user),
    account: loginMeta
  });
};

const normalizeClient = (request) => String(request.headers['x-client'] || 'unknown').slice(0, 32);

export default async function authRoutes(app) {
  /**
   * 微信小程序登录：wx.login() 拿 code，换 openid。
   * 若同一次请求带上 phoneCode，会顺带绑定手机号，用于跨端合并账号。
   */
  app.post(
    '/wechat/miniprogram',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 256 },
            phoneCode: { type: 'string', maxLength: 256 },
            expectedPhone: { type: 'string', pattern: '^1[3-9][0-9]{9}$' },
            profile: {
              type: 'object',
              properties: {
                nickname: { type: 'string', maxLength: 64 },
                avatarUrl: { type: 'string', maxLength: 512 }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const { code, phoneCode, profile, expectedPhone } = request.body;
      const session = await wxCode2Session(code);

      let phone = null;
      if (phoneCode) {
        const phoneInfo = await wxPhoneByCode(phoneCode);
        phone = phoneInfo.phone;
        if(expectedPhone && expectedPhone!==phone)throw errors.badRequest('填写的手机号与微信验证的号码不一致，请重新确认');
      }

      const result = await resolveIdentity({
        provider: 'wechat_mp',
        providerUid: session.openid,
        unionId: session.unionid,
        phone,
        profile,
        meta: { client: normalizeClient(request) }
      });

      return loginResponse(result.userId, normalizeClient(request), {
        merged: result.merged,
        created: result.created
      });
    }
  );

  /** 抖音小程序登录，账号体系与微信共用 user 表 */
  app.post(
    '/douyin/miniprogram',
    {
      schema: {
        body: {
          type: 'object',
          required: ['code'],
          properties: {
            code: { type: 'string', minLength: 1, maxLength: 256 },

            profile: {
              type: 'object',
              properties: {
                nickname: { type: 'string', maxLength: 64 },
                avatarUrl: { type: 'string', maxLength: 512 }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const { code, profile } = request.body;
      const session = await dyCode2Session(code);

      const result = await resolveIdentity({
        provider: 'douyin_mp',
        providerUid: session.openid,
        unionId: session.unionid,
        phone: null, // 抖音不得信任客户端直接提交的手机号；等待平台验证适配器。
        profile,
        meta: { client: normalizeClient(request) }
      });

      return loginResponse(result.userId, normalizeClient(request), {
        merged: result.merged,
        created: result.created
      });
    }
  );

  /**
   * 刷新令牌。refresh token 一次性使用，换新后旧的立即作废，
   * 防止 token 泄露后被长期复用。
   */
  app.post(
    '/refresh',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string', minLength: 20 } }
        }
      }
    },
    async (request) => {
      const hash = hashToken(request.body.refreshToken);
      const revoked = await query(
        `update refresh_token set revoked_at = now()
         where token_hash = $1 and revoked_at is null and expires_at > now()
         returning user_id, client`,
        [hash]
      );
      if (!revoked.rows.length) {
        throw errors.unauthorized('登录已过期，请重新登录');
      }
      const { user_id: userId, client } = revoked.rows[0];
      return loginResponse(userId, client || normalizeClient(request));
    }
  );

  /** 绑定手机号（微信 getPhoneNumber 返回的 code），用于多端账号合并 */
  app.post(
    '/phone/bind',
    {
      preHandler: app.authenticate,
      schema: {
        body: {
          type: 'object',
          required: ['phoneCode'],
          properties: { phoneCode: { type: 'string', minLength: 1 } }
        }
      }
    },
    async (request) => {
      const { phone } = await wxPhoneByCode(request.body.phoneCode);

      const userId=await bindVerifiedPhone(request.user.id,phone);
      return loginResponse(userId,normalizeClient(request),{merged:userId!==request.user.id});
    }
  );

  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    const [quota, identities] = await Promise.all([
      getQuota(request.user.id),
      listIdentities(request.user.id)
    ]);
    return ok({
      user: publicUser(request.user),
      quota,
      identities: identities.map((item) => ({
        provider: item.provider,
        createdAt: item.created_at,
        lastLoginAt: item.last_login_at
      }))
    });
  });

  /** 注销当前设备，不影响其他端登录状态 */
  app.post(
    '/logout',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string', minLength: 20 } }
        }
      }
    },
    async (request) => {
      await query('update refresh_token set revoked_at = now() where token_hash = $1 and revoked_at is null', [
        hashToken(request.body.refreshToken)
      ]);
      return ok({ loggedOut: true });
    }
  );

  /** 注销全部设备，用于「账号安全」场景 */
  app.post('/logout-all', { preHandler: app.authenticate }, async (request) => {
    await query('update refresh_token set revoked_at = now() where user_id = $1 and revoked_at is null', [
      request.user.id
    ]);
    return ok({ loggedOut: true });
  });
}
