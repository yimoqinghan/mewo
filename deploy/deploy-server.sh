#!/usr/bin/env bash
set -Eeuo pipefail

# Deploy the server bundle without exposing .env or requiring a browser upload.
# Production defaults are the current 言喵 server; override them when needed.
# Optional: YANMIAO_SERVER_HOST, YANMIAO_SERVER_USER, YANMIAO_SERVER_PORT (22),
#           YANMIAO_SERVER_PATH (/www/yanmiao),
#           YANMIAO_SSH_KEY (uses the default SSH agent/key when omitted)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_HOST="${YANMIAO_SERVER_HOST:-api.missmeow.net}"
SERVER_USER="${YANMIAO_SERVER_USER:-root}"
SERVER_PORT="${YANMIAO_SERVER_PORT:-22}"
SERVER_PATH="${YANMIAO_SERVER_PATH:-/www/yanmiao}"
SSH_KEY_ARGS=()

if [[ -n "${YANMIAO_SSH_KEY:-}" ]]; then
  SSH_KEY_ARGS=(-i "$YANMIAO_SSH_KEY")
elif [[ -f "${HOME}/.ssh/yanmiao_deploy" ]]; then
  SSH_KEY_ARGS=(-i "${HOME}/.ssh/yanmiao_deploy")
fi

SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"
ARCHIVE="$(mktemp -t yanmiao-server-deploy.XXXXXX).tgz"
REMOTE_ARCHIVE="${SERVER_PATH}/yanmiao-server-deploy.tgz"
BACKUP_KEEP="${YANMIAO_BACKUP_KEEP:-3}"
cleanup() { rm -f "$ARCHIVE"; }
trap cleanup EXIT

USE_RSYNC_PUBLIC=0
if command -v rsync >/dev/null 2>&1 && ssh -p "$SERVER_PORT" "${SSH_KEY_ARGS[@]}" "$SSH_TARGET" "command -v rsync >/dev/null 2>&1"; then
  USE_RSYNC_PUBLIC=1
fi

if [[ "$USE_RSYNC_PUBLIC" -eq 1 ]]; then
  # 代码包轻量化传输；public/（静态源资源）走增量同步，节省 3Mbps 带宽。
  tar -czf "$ARCHIVE" -C "$ROOT_DIR/server" src scripts package.json package-lock.json legal
  RSYNC_SSH="ssh -p ${SERVER_PORT}"
  if [[ "${#SSH_KEY_ARGS[@]}" -gt 0 ]]; then
    RSYNC_SSH+=" -i ${SSH_KEY_ARGS[1]}"
  fi
  rsync -az --delete -e "$RSYNC_SSH" "$ROOT_DIR/server/public/" "$SSH_TARGET:${SERVER_PATH}/server/public/"
else
  # 回退方案：无 rsync 时连同 public 一并打包。
  tar -czf "$ARCHIVE" -C "$ROOT_DIR/server" src public scripts package.json package-lock.json legal
fi

scp -P "$SERVER_PORT" "${SSH_KEY_ARGS[@]}" "$ARCHIVE" "$SSH_TARGET:$REMOTE_ARCHIVE"

ssh -p "$SERVER_PORT" "${SSH_KEY_ARGS[@]}" "$SSH_TARGET" \
  "SERVER_PATH='$SERVER_PATH' REMOTE_ARCHIVE='$REMOTE_ARCHIVE' BACKUP_KEEP='$BACKUP_KEEP' bash -s" <<'REMOTE_SCRIPT'
set -Eeuo pipefail
cd "$SERVER_PATH"
STAMP="$(date +%Y%m%d%H%M%S)"
# 备份排除大体积依赖与模型目录，避免 40GB SSD 被历史备份打满
tar -czf "/root/yanmiao-backup-${STAMP}.tgz" \
  --exclude='server/node_modules' \
  --exclude='server/.venv-sticker' \
  --exclude='server/.models' \
  --exclude='server/.storage' \
  server
# 仅保留最近 N 份备份
ls -1t /root/yanmiao-backup-*.tgz 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -f

OLD_LOCK_HASH="$(sha256sum server/package-lock.json 2>/dev/null | awk '{print $1}' || true)"
tar -xzf "$REMOTE_ARCHIVE" -C server
cd server
NEW_LOCK_HASH="$(sha256sum package-lock.json 2>/dev/null | awk '{print $1}' || true)"
if [[ ! -d node_modules || "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" ]]; then
  npm ci --omit=dev
fi
npm run migrate
npm run sync:assets
pm2 restart yanmiao-api yanmiao-worker
pm2 save
rm -f "$REMOTE_ARCHIVE"
REMOTE_SCRIPT

wait_for_url() {
  local url="$1"
  local attempt
  for attempt in $(seq 1 15); do
    if curl -fsS --max-time 10 "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  printf '部署后校验失败：%s\n' "$url" >&2
  return 1
}

wait_for_url "https://api.missmeow.net/healthz"
wait_for_url "https://api.missmeow.net/legal/user-agreement.html"
wait_for_url "https://api.missmeow.net/legal/privacy-policy.html"
printf '言喵服务端部署完成，协议页面已通过线上校验。\n'
