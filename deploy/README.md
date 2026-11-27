# 言喵服务端部署

`deploy-server.sh` 使用本机的 `ssh` / `scp` 上传并部署 `server/`，不经过浏览器，也不会打包 `.env`。当前默认生产地址是 `api.missmeow.net`，账号是 `root`。

```bash
# 当前生产地址、root 账号和言喵专用密钥路径已内置，通常直接执行即可：
./deploy/deploy-server.sh

# 如果要临时换密钥，再覆盖这个变量：
# export YANMIAO_SSH_KEY=/你的私钥路径

```

脚本会先在服务器 `/root/` 下生成时间戳备份，然后解包、执行数据库迁移、重启 `yanmiao-api` 和 `yanmiao-worker`，最后校验健康检查与隐私/用户协议页面。
