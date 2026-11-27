-- 喵档案分享：二维码只携带短码，服务端按分享记录返回公开快照。
-- 分享由用户主动创建，默认 180 天后失效，不改变猫咪资料本身的私密属性。
create table if not exists cat_share (
  id            uuid primary key default gen_random_uuid(),
  cat_id        uuid not null references cat(id) on delete cascade,
  owner_user_id uuid not null references app_user(id) on delete cascade,
  share_code    varchar(20) not null unique,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists cat_share_cat_idx on cat_share (cat_id, created_at desc);
create index if not exists cat_share_active_idx on cat_share (share_code, expires_at)
  where revoked_at is null;
