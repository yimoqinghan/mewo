import { config } from '../config.js';
import { query, withTransaction } from '../db/pool.js';
import { errors } from '../lib/errors.js';

const QUOTA_FIELDS = {
  image: { limit: 'image_daily_limit', used: 'image_used_today', otherUsed: 'chat_used_today', configKey: 'imageDailyFreeLimit' },
  chat: { limit: 'chat_daily_limit', used: 'chat_used_today', otherUsed: 'image_used_today', configKey: 'chatDailyFreeLimit' }
};

function normalizeType(type) {
  return type === 'chat' ? 'chat' : 'image';
}

function freeLimit(type) {
  return config.quota[QUOTA_FIELDS[normalizeType(type)].configKey];
}

function entitlementFromRow(row) {
  const vip = row?.account_tier === 'vip'
    && (!row.vip_expires_at || new Date(row.vip_expires_at).getTime() > Date.now());
  return {
    accountTier: vip ? 'vip' : 'free',
    isVip: vip,
    vipExpiresAt: row?.vip_expires_at || null
  };
}

async function getEntitlement(userId, client = { query }) {
  const result = await client.query(
    'select account_tier, vip_expires_at from app_user where id = $1',
    [userId]
  );
  return entitlementFromRow(result.rows[0]);
}

function unlimitedQuota(type, entitlement) {
  return {
    quotaType: normalizeType(type),
    daily_limit: null,
    used_today: 0,
    paid_credits: 0,
    remaining: null,
    unlimited: true,
    ...entitlement
  };
}

/** 聊天和生图分开扣减；VIP 不写入使用量，但仍由调用方留下审计流水。 */
export async function consumeQuota(userId, cost = 1, client = { query }, type = 'image') {
  const quotaType = normalizeType(type);
  const fields = QUOTA_FIELDS[quotaType];
  const entitlement = await getEntitlement(userId, client);
  if (entitlement.isVip) return unlimitedQuota(quotaType, entitlement);

  const limit = freeLimit(quotaType);
  if (cost > limit) return null;
  const result = await client.query(
    `insert into user_quota (user_id, ${fields.limit}, ${fields.used}, quota_date)
     values ($1, $2, $3, current_date)
     on conflict (user_id) do update set
       ${fields.used} = case
         when user_quota.quota_date = current_date then user_quota.${fields.used} + $3
         else $3
       end,
       ${fields.otherUsed} = case
         when user_quota.quota_date = current_date then user_quota.${fields.otherUsed}
         else 0
       end,
       quota_date = current_date,
       updated_at = now()
     where case
       when user_quota.quota_date = current_date
         then user_quota.${fields.used} + $3 <= user_quota.${fields.limit}
       else $3 <= user_quota.${fields.limit}
     end
     returning ${fields.used} as used_today, ${fields.limit} as daily_limit, paid_credits`,
    [userId, limit, cost]
  );

  if (!result.rows.length) return null;
  return {
    quotaType,
    ...result.rows[0],
    remaining: Math.max(result.rows[0].daily_limit - result.rows[0].used_today, 0),
    unlimited: false,
    ...entitlement
  };
}

/** 生成失败时退还生图额度，避免上游抖动吃掉用户次数。 */
export async function refundQuota(userId, cost = 1, jobId = null) {
  await withTransaction(async (client) => {
    const entitlement = await getEntitlement(userId, client);
    if (entitlement.isVip) return;

    if (jobId) {
      const job = await client.query('select status from generation_job where id = $1 and user_id = $2 for update', [jobId, userId]);
      if (!job.rows.length || !['failed', 'canceled', 'expired'].includes(job.rows[0].status)) return;
      const existing = await client.query("select 1 from credit_ledger where ref_id = $1 and reason = 'generation_refund'", [jobId]);
      if (existing.rows.length) return;
    }
    const updated = await client.query(
      `update user_quota
       set image_used_today = greatest(image_used_today - $2, 0), updated_at = now()
       where user_id = $1 and quota_date = current_date
       returning image_used_today`,
      [userId, cost]
    );
    await client.query(
      `insert into credit_ledger (user_id, delta, reason, ref_id, balance_after)
       values ($1, $2, 'generation_refund', $3, $4)`,
      [userId, cost, jobId, updated.rows[0]?.image_used_today ?? null]
    );
  });
}

export async function getQuota(userId) {
  const result = await query(
    `select q.*, u.account_tier, u.vip_expires_at
     from app_user u
     left join user_quota q on q.user_id = u.id
     where u.id = $1`,
    [userId]
  );
  const row = result.rows[0] || {};
  const entitlement = entitlementFromRow(row);
  if (entitlement.isVip) {
    return {
      accountTier: 'vip',
      isVip: true,
      vipExpiresAt: entitlement.vipExpiresAt,
      unlimited: true,
      dailyLimit: null,
      usedToday: 0,
      remaining: null,
      paidCredits: row.paid_credits || 0,
      imageDailyLimit: null,
      imageUsedToday: 0,
      imageRemaining: null,
      chatDailyLimit: null,
      chatUsedToday: 0,
      chatRemaining: null
    };
  }

  const isToday = row.quota_date
    ? new Date(row.quota_date).toDateString() === new Date().toDateString()
    : true;
  const imageDailyLimit = row.image_daily_limit || row.daily_limit || config.quota.imageDailyFreeLimit;
  const chatDailyLimit = row.chat_daily_limit || config.quota.chatDailyFreeLimit;
  const imageUsedToday = isToday ? (row.image_used_today ?? row.used_today ?? 0) : 0;
  const chatUsedToday = isToday ? (row.chat_used_today || 0) : 0;
  return {
    accountTier: 'free',
    isVip: false,
    vipExpiresAt: null,
    unlimited: false,
    // 保留旧客户端字段，默认表示生图额度。
    dailyLimit: imageDailyLimit,
    usedToday: imageUsedToday,
    remaining: Math.max(imageDailyLimit - imageUsedToday, 0),
    paidCredits: row.paid_credits || 0,
    imageDailyLimit,
    imageUsedToday,
    imageRemaining: Math.max(imageDailyLimit - imageUsedToday, 0),
    chatDailyLimit,
    chatUsedToday,
    chatRemaining: Math.max(chatDailyLimit - chatUsedToday, 0),
    updatedAt: row.updated_at || null
  };
}

export async function requireQuota(userId, cost = 1, client, type = 'image') {
  const remaining = await consumeQuota(userId, cost, client, type);
  if (!remaining) throw errors.quotaExceeded();
  return remaining;
}

/** 非任务型 AI 请求失败时退回指定类型的额度。 */
export async function refundQuotaDirect(userId, cost = 1, refId = null, reason = 'chat_refund', type = 'chat') {
  const quotaType = normalizeType(type);
  const fields = QUOTA_FIELDS[quotaType];
  await withTransaction(async (client) => {
    const entitlement = await getEntitlement(userId, client);
    if (entitlement.isVip) return;

    if (refId) {
      const existing = await client.query(
        'select 1 from credit_ledger where ref_id = $1 and reason = $2',
        [refId, reason]
      );
      if (existing.rows.length) return;
    }
    const updated = await client.query(
      `update user_quota
       set ${fields.used} = greatest(${fields.used} - $2, 0), updated_at = now()
       where user_id = $1 and quota_date = current_date
       returning ${fields.used} as used_today`,
      [userId, cost]
    );
    await client.query(
      `insert into credit_ledger (user_id, delta, reason, ref_id, balance_after)
       values ($1, $2, $3, $4, $5)`,
      [userId, cost, reason, refId, updated.rows[0]?.used_today ?? null]
    );
  });
}
