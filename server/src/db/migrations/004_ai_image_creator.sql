insert into generation_template (key,name,category,description,config,credits_cost,min_cats,max_cats,sort_order,enabled)
values (
  'ai-image',
  'AI 图片创作',
  'image',
  '登录后通过文字描述、参考图和专业参数生成图片，不绑定宠物档案',
  '{"aspectRatio":"1:1","promptHint":"根据创作者的描述生成一张完整、有明确主体和构图的图片"}',
  1,
  0,
  0,
  5,
  true
)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  config = excluded.config,
  credits_cost = excluded.credits_cost,
  min_cats = 0,
  max_cats = 0,
  sort_order = excluded.sort_order,
  enabled = true;
