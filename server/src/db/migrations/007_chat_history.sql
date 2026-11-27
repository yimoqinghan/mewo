-- 聊天记录默认长期保留，只有用户主动清空当前猫咪会话时才删除。
create table if not exists chat_message (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references app_user(id) on delete cascade,
  cat_id             uuid not null references cat(id) on delete cascade,
  role               text not null check (role in ('user', 'assistant')),
  content            text not null check (char_length(content) between 1 and 4000),
  model              text,
  client_message_id  text,
  created_at         timestamptz not null default now()
);

create unique index if not exists chat_message_client_idx
  on chat_message (user_id, cat_id, client_message_id, role)
  where client_message_id is not null;

create index if not exists chat_message_history_idx
  on chat_message (user_id, cat_id, created_at asc, id asc);
