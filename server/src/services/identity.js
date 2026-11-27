import { query, withTransaction } from '../db/pool.js';
import { errors } from '../lib/errors.js';
import { createRefreshToken, refreshExpiryDate, signAccessToken, accessTokenTtlSeconds } from '../lib/tokens.js';

/**
 * 多端账号的核心逻辑：身份（identity）与账号（user）分离。
 *
 * 合并优先级：
 *   1. 该平台身份已存在  → 直接登录到它所属的 user
 *   2. 手机号已绑定到某个 user → 把新身份挂到那个 user（跨端合并）
 *   3. unionid 仅记录平台元数据；跨端合并以已验证手机号为准
 *   4. 都没有 → 新建 user
 *
 * 这样用户在微信小程序里建的猫咪档案，用同一个手机号登录抖音小程序后依然存在。
 */
export async function resolveIdentity({ provider, providerUid, unionId, phone, profile, meta }) {
  return withTransaction(async (client) => {
    // Serialize verified-phone and platform-identity creation to avoid split accounts.
    if(phone)await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`phone:${phone}`]);
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`identity:${provider}:${providerUid}`]);
    // 1. 已有平台身份
    const existing = await client.query(
      'select * from user_identity where provider = $1 and provider_uid = $2',
      [provider, providerUid]
    );

    if (existing.rows.length) {
      const identity = existing.rows[0];
      await client.query(
        'update user_identity set last_login_at = now(), union_id = coalesce($2, union_id) where id = $1',
        [identity.id, unionId || null]
      );
      if (phone) {
        const boundId=await bindPhone(client, identity.user_id, phone);
        return {userId:boundId,merged:boundId!==identity.user_id,created:false};
      }
      return { userId: identity.user_id, merged: false, created: false };
    }

    // 2. 手机号匹配
    let userId = null;
    let merged = false;

    if (phone) {
      const byPhone = await client.query('select id from app_user where phone = $1', [phone]);
      if (byPhone.rows.length) {
        userId = byPhone.rows[0].id;
        merged = true;
      }
    }

    // union_id 仅保存平台元数据；跨端只依据已验证手机号关联。

    // 4. 新建账号
    let created = false;
    if (!userId) {
      const inserted = await client.query(
        `insert into app_user (display_name, avatar_url, phone)
         values ($1, $2, $3) returning id`,
        [profile?.nickname || null, profile?.avatarUrl || null, phone || null]
      );
      userId = inserted.rows[0].id;
      created = true;
    } else if (profile?.nickname) {
      // 已存在账号时只补空字段，不覆盖用户已设置的内容
      await client.query(
        `update app_user set
           display_name = coalesce(display_name, $2),
           avatar_url = coalesce(avatar_url, $3),
           updated_at = now()
         where id = $1`,
        [userId, profile.nickname, profile.avatarUrl || null]
      );
    }

    await client.query(
      `insert into user_identity (user_id, provider, provider_uid, union_id, meta, last_login_at)
       values ($1, $2, $3, $4, $5::jsonb, now())`,
      [userId, provider, providerUid, unionId || null, JSON.stringify(meta || {})]
    );

    return { userId, merged, created };
  });
}

async function bindPhone(client, userId, phone) {
  const current=await client.query('select id,phone from app_user where id=$1 for update',[userId]);
  if(current.rows[0].phone && current.rows[0].phone!==phone)throw errors.conflict('当前微信已绑定其他手机号，请使用原号码登录');
  const occupied=await client.query('select id from app_user where phone=$1 and id<>$2 for update',[phone,userId]);
  if(occupied.rows.length){
    // Only a previously unbound account can converge onto a verified phone owner.
    const target=occupied.rows[0].id;
    await client.query('update cat set is_default=false where user_id=$1',[userId]);
    for(const [table,column] of [['cat','user_id'],['asset','owner_user_id'],['generation_job','user_id'],['work','user_id'],['credit_ledger','user_id'],['user_identity','user_id']]){
      await client.query(`update ${table} set ${column}=$2 where ${column}=$1`,[userId,target]);
    }
    await client.query(`insert into user_quota(user_id,daily_limit,used_today,quota_date,paid_credits)
      select $2,daily_limit,case when quota_date=current_date then used_today else 0 end,current_date,paid_credits from user_quota where user_id=$1
      on conflict(user_id)do update set used_today=(case when user_quota.quota_date=current_date then user_quota.used_today else 0 end)+excluded.used_today,quota_date=current_date,paid_credits=user_quota.paid_credits+excluded.paid_credits`,[userId,target]);
    await client.query('delete from user_quota where user_id=$1',[userId]);
    await client.query('update refresh_token set revoked_at=now() where user_id=$1',[userId]);
    await client.query("update app_user set status='disabled',updated_at=now() where id=$1",[userId]);
    return target;
  }
  await client.query('update app_user set phone=$2,updated_at=now() where id=$1',[userId,phone]);
  return userId;
}

export function bindVerifiedPhone(userId,phone){
  return withTransaction(async client=>{
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`phone:${phone}`]);
    return bindPhone(client,userId,phone);
  });
}

export async function getUserById(userId) {
  const result = await query('select * from app_user where id = $1', [userId]);
  return result.rows[0] || null;
}

export async function getUserByPhone(phone) {
  const result = await query('select * from app_user where phone = $1', [phone]);
  return result.rows[0] || null;
}

export async function listIdentities(userId) {
  const result = await query(
    'select provider, provider_uid, union_id, created_at, last_login_at from user_identity where user_id = $1 order by created_at',
    [userId]
  );
  return result.rows;
}

/** 签发 access + refresh，并记录 refresh 方便按设备吊销 */
export async function issueTokens(userId, clientTag) {
  const accessToken = signAccessToken(userId, clientTag);
  const { token, hash } = createRefreshToken();

  await query(
    `insert into refresh_token (user_id, token_hash, client, expires_at)
     values ($1, $2, $3, $4)`,
    [userId, hash, clientTag || null, refreshExpiryDate()]
  );

  return {
    accessToken,
    refreshToken: token,
    tokenType: 'Bearer',
    expiresIn: accessTokenTtlSeconds(),
    refreshExpiresIn: refreshExpiryDate().toISOString()
  };
}

export function publicUser(user) {
  const isVip = user.account_tier === 'vip'
    && (!user.vip_expires_at || new Date(user.vip_expires_at).getTime() > Date.now());
  return {
    id: user.id,
    displayName: user.display_name || null,
    avatarUrl: user.avatar_url || null,
    phoneBound: Boolean(user.phone),
    accountTier: isVip ? 'vip' : 'free',
    isVip,
    vipExpiresAt: user.vip_expires_at || null,
    // 手机号脱敏返回，客户端只需要知道是否绑定
    phoneMasked: user.phone ? `${user.phone.slice(0, 3)}****${user.phone.slice(-4)}` : null,
    createdAt: user.created_at
  };
}
