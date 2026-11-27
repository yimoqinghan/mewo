-- ============================================================
-- 言喵后端初始表结构
-- 设计原则：
-- 1. 账号与身份分离：一个 user 可绑定多个平台身份（微信/抖音/手机号），
--    这是「多端共用一套数据」的基础。
-- 2. 所有媒体只存 COS 对象键，数据库不存二进制、不存临时 URL。
-- 3. 生成任务与作品分离：任务可失败重试，作品只在成功后产生。
-- 4. 默认私密：asset / work 的 visibility 默认 private。
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 账号 ----------
create table if not exists app_user (
  id            uuid primary key default gen_random_uuid(),
  display_name  text,
  avatar_url    text,
  -- 手机号是跨端合并账号的唯一稳定键，可为空（未绑定时）
  phone         text,
  status        text not null default 'active' check (status in ('active', 'disabled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists app_user_phone_key
  on app_user (phone) where phone is not null;

-- 平台身份：wechat_mp / douyin_mp / h5 / apple / anonymous
create table if not exists user_identity (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  provider       text not null,
  provider_uid   text not null,
  union_id       text,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz,
  constraint user_identity_provider_uid_key unique (provider, provider_uid)
);

create index if not exists user_identity_user_idx on user_identity (user_id);
create index if not exists user_identity_union_idx on user_identity (union_id) where union_id is not null;

create table if not exists refresh_token (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app_user(id) on delete cascade,
  token_hash  text not null unique,
  client      text,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists refresh_token_user_idx on refresh_token (user_id);

-- ---------- 媒体资产 ----------
create table if not exists asset (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null references app_user(id) on delete cascade,
  storage        text not null default 'cos',
  object_key     text not null,
  mime           text not null,
  byte_size      bigint,
  width          integer,
  height         integer,
  purpose        text not null default 'input' check (purpose in ('input', 'output', 'avatar')),
  visibility     text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  status         text not null default 'pending' check (status in ('pending', 'ready', 'blocked', 'deleted')),
  created_at     timestamptz not null default now(),
  constraint asset_object_key_key unique (storage, object_key)
);

create index if not exists asset_owner_idx on asset (owner_user_id, created_at desc);

-- ---------- 猫咪档案 ----------
create table if not exists cat (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references app_user(id) on delete cascade,
  name             text not null,
  gender           text,
  birthday         date,
  breed            text,
  coat             text,
  traits           text[] not null default '{}',
  personality      text,
  likes            text[] not null default '{}',
  dislikes         text[] not null default '{}',
  avatar_asset_id  uuid references asset(id) on delete set null,
  is_default       boolean not null default false,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists cat_user_idx on cat (user_id, created_at);
-- 每个用户最多一只默认猫
create unique index if not exists cat_one_default_idx
  on cat (user_id) where is_default and archived_at is null;

-- 猫咪人格底座（P0.5），一只猫一份，可反复迭代
create table if not exists cat_persona (
  id               uuid primary key default gen_random_uuid(),
  cat_id           uuid not null references cat(id) on delete cascade,
  past_life_role   text,
  past_life_story  text,
  speech_style     text,
  catchphrase      text,
  prompt_snippet   text,
  voice_id         text,
  status           text not null default 'draft' check (status in ('draft', 'confirmed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint cat_persona_cat_key unique (cat_id)
);

-- ---------- 生成模板 ----------
create table if not exists generation_template (
  key          text primary key,
  name         text not null,
  category     text not null default 'image',
  description  text,
  -- 提示词骨架、尺寸、风格等，由运营侧配置，不写死在代码里
  config       jsonb not null default '{}'::jsonb,
  credits_cost integer not null default 1,
  min_cats     integer not null default 1,
  max_cats     integer not null default 1,
  enabled      boolean not null default true,
  sort_order   integer not null default 100,
  created_at   timestamptz not null default now()
);

-- ---------- 生成任务 ----------
create table if not exists generation_job (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references app_user(id) on delete cascade,
  client           text,
  cat_ids          uuid[] not null default '{}',
  template_key     text not null,
  input_asset_ids  uuid[] not null default '{}',
  params           jsonb not null default '{}'::jsonb,
  status           text not null default 'queued'
                   check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled', 'expired')),
  progress         integer not null default 0,
  provider         text,
  provider_job_id  text,
  result           jsonb,
  error_code       text,
  error_message    text,
  attempt          integer not null default 0,
  max_attempts     integer not null default 2,
  credits_cost     integer not null default 0,
  scheduled_at     timestamptz not null default now(),
  locked_at        timestamptz,
  locked_by        text,
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists generation_job_queue_idx
  on generation_job (scheduled_at) where status = 'queued';
create index if not exists generation_job_user_idx
  on generation_job (user_id, created_at desc);
create index if not exists generation_job_running_idx
  on generation_job (locked_at) where status = 'running';

-- ---------- 作品 ----------
create table if not exists work (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references app_user(id) on delete cascade,
  job_id           uuid references generation_job(id) on delete set null,
  cat_ids          uuid[] not null default '{}',
  template_key     text not null,
  title            text,
  body             text,
  cover_asset_id   uuid references asset(id) on delete set null,
  visibility       text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  -- 为空表示还在「最近生成」里，用户主动保存后才有值
  saved_at         timestamptz,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists work_user_idx on work (user_id, created_at desc);
create index if not exists work_cat_idx on work using gin (cat_ids);

-- ---------- 额度与流水 ----------
create table if not exists user_quota (
  user_id      uuid primary key references app_user(id) on delete cascade,
  daily_limit  integer not null default 3,
  used_today   integer not null default 0,
  quota_date   date not null default current_date,
  paid_credits integer not null default 0,
  updated_at   timestamptz not null default now()
);

create table if not exists credit_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references app_user(id) on delete cascade,
  delta          integer not null,
  reason         text not null,
  ref_id         uuid,
  balance_after  integer,
  created_at     timestamptz not null default now()
);

create index if not exists credit_ledger_user_idx on credit_ledger (user_id, created_at desc);
