-- 用户生成的作品统一作为公开作品使用 CDN；原始输入素材仍保持私有。
update asset
set visibility = 'public'
where purpose = 'output'
  and status <> 'deleted';

update work
set visibility = 'public'
where deleted_at is null
  and cover_asset_id in (
    select id from asset where purpose = 'output' and status <> 'deleted'
  );
