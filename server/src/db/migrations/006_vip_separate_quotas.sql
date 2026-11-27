-- VIP 账户与聊天/生图独立额度。
-- 保留旧字段，兼容已经存在的 user_quota 数据和旧客户端。

alter table app_user
  add column if not exists account_tier text not null default 'free',
  add column if not exists vip_expires_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_user_account_tier_check'
  ) then
    alter table app_user
      add constraint app_user_account_tier_check check (account_tier in ('free', 'vip'));
  end if;
end $$;

alter table user_quota
  add column if not exists image_daily_limit integer not null default 3,
  add column if not exists image_used_today integer not null default 0,
  add column if not exists chat_daily_limit integer not null default 30,
  add column if not exists chat_used_today integer not null default 0;

-- 把旧的统一额度平移为生图额度，避免升级后丢失当前使用量。
update user_quota
set image_daily_limit = coalesce(daily_limit, 3),
    image_used_today = coalesce(used_today, 0)
where true;
