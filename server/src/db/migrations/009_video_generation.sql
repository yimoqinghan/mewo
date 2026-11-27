-- P0.5：猫咪短视频创作闭环。真实模型、异步任务、失败退款沿用 generation_job。
insert into generation_template (key, name, category, description, config, credits_cost, min_cats, max_cats, sort_order, enabled)
values (
  'special-video',
  '猫咪短视频',
  'video',
  '基于猫咪参考照片生成默认 3 秒竖屏短视频；上游最低时长限制会在服务端透明保护。',
  '{"aspectRatio":"9:16","defaultDuration":3,"promptHint":"保留猫咪外貌一致，生成有清晰三拍动作的竖屏短视频"}',
  3,
  0,
  1,
  70,
  true
)
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  config = excluded.config,
  credits_cost = excluded.credits_cost,
  min_cats = excluded.min_cats,
  max_cats = excluded.max_cats,
  sort_order = excluded.sort_order,
  enabled = true;
