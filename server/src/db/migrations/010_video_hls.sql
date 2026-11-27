create table if not exists video_variant (
  asset_id             uuid primary key references asset(id) on delete cascade,
  format               text not null default 'hls' check (format in ('hls')),
  manifest_object_key  text not null,
  segment_object_keys  jsonb not null default '[]'::jsonb,
  playlist             text not null,
  status               text not null default 'ready' check (status in ('ready', 'failed')),
  created_at           timestamptz not null default now()
);
