-- 页面年龄是用户填写的描述，不可写入 birthday 日期字段。
-- 保留已有生日及档案；老记录的年龄为空，之后可单独编辑。
alter table cat add column if not exists age varchar(32);
