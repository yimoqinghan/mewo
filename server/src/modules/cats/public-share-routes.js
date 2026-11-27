import { randomBytes } from 'node:crypto';
import { query } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';
import { resolveAssetUrls } from '../../services/assets.js';
import { getWxaCodeUnlimit } from '../../services/wechat.js';

const SHARE_CODE_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';

function makeShareCode(length = 14) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (value) => SHARE_CODE_ALPHABET[value % SHARE_CODE_ALPHABET.length]).join('');
}

function serializePublic(row, urlMap) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: row.age || '',
    birthday: row.birthday,
    breed: row.breed,
    coat: row.coat,
    traits: row.traits || [],
    personality: row.personality,
    likes: row.likes || [],
    dislikes: row.dislikes || [],
    avatar: row.avatar_asset_id
      ? { assetId: row.avatar_asset_id, url: urlMap.get(row.avatar_asset_id) || null }
      : null,
    persona: row.persona_id
      ? {
          pastLifeRole: row.past_life_role,
          pastLifeStory: row.past_life_story,
          speechStyle: row.speech_style,
          catchphrase: row.catchphrase,
          status: row.persona_status
        }
      : null,
    shareExpiresAt: row.expires_at
  };
}

/**
 * 无需登录的扫码落地接口。二维码只携带 share_code，不能直接枚举 cat UUID。
 */
export async function publicCatShareRoutes(app) {
  app.get('/public-share/:code', async (request) => {
    const code = String(request.params.code || '').trim().toLowerCase();
    if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{10,20}$/.test(code)) throw errors.notFound('喵档案分享已失效');

    const result = await query(
      `select c.id, c.name, c.gender, c.age, c.birthday::text as birthday, c.breed,
              c.coat, c.traits, c.personality, c.likes, c.dislikes, c.avatar_asset_id,
              s.expires_at,
              p.id as persona_id, p.past_life_role, p.past_life_story,
              p.speech_style, p.catchphrase, p.status as persona_status
         from cat_share s
         join cat c on c.id = s.cat_id
         left join cat_persona p on p.cat_id = c.id
        where s.share_code = $1
          and s.revoked_at is null
          and s.expires_at > now()
          and c.archived_at is null`,
      [code]
    );
    if (!result.rows.length) throw errors.notFound('喵档案分享已失效或已被收回');

    const row = result.rows[0];
    const urlMap = await resolveAssetUrls([row.avatar_asset_id]);
    return ok({ cat: serializePublic(row, urlMap) });
  });
}

/** 需要登录：为当前用户主动分享的猫咪创建短码并生成微信官方小程序码。 */
export async function protectedCatShareRoutes(app) {
  app.post('/:id/share-qr', { preHandler: app.authenticate }, async (request) => {
    const catResult = await query(
      `select id from cat where id = $1 and user_id = $2 and archived_at is null`,
      [request.params.id, request.user.id]
    );
    if (!catResult.rows.length) throw errors.notFound('猫咪档案不存在');

    const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
    // 项目当前没有在 Fastify 上挂 pg 插件，使用唯一冲突重试保护短码写入。
    let inserted;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = makeShareCode();
      try {
        inserted = await query(
          `insert into cat_share (cat_id, owner_user_id, share_code, expires_at)
           values ($1, $2, $3, $4)
           returning share_code, expires_at`,
          [request.params.id, request.user.id, code, expiresAt]
        );
        break;
      } catch (error) {
        if (error.code !== '23505' || attempt === 4) throw error;
      }
    }

    const code = inserted.rows[0].share_code;
    const qr = await getWxaCodeUnlimit({
      scene: code,
      page: 'pages/cat-profile/cat-profile'
    });
    return ok({
      shareCode: code,
      expiresAt: inserted.rows[0].expires_at,
      qrDataUrl: `data:${qr.contentType};base64,${qr.buffer.toString('base64')}`
    });
  });
}
