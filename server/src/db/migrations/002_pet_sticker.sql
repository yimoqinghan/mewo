insert into generation_template (key,name,category,description,config,credits_cost,min_cats,max_cats,sort_order,enabled)
values ('pet-sticker','宠物贴纸','image','保留宠物原貌，智能抠图并添加白色描边','{"aspectRatio":"1:1"}',1,1,1,0,true)
on conflict (key) do nothing;
alter table generation_job add column if not exists request_key text;
create unique index if not exists generation_request_key on generation_job(user_id,request_key) where request_key is not null;
