insert into generation_template (key,name,category,description,config,credits_cost,min_cats,max_cats,sort_order,enabled)
values
  ('special-gif','猫咪 GIF','gif','使用真实图生视频/动图模型生成循环 GIF','{"aspectRatio":"1:1","promptHint":"基于参考照片生成一段猫咪自然、连贯、可循环的短 GIF"}',2,0,1,80,true),
  ('special-emoji','猫咪表情','emoji','使用真实图片模型生成聊天表情','{"aspectRatio":"1:1","promptHint":"基于参考照片生成一张猫咪聊天表情，保留外貌特征，主体清晰"}',1,0,1,90,true)
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
