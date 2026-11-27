/**
 * 端到端冒烟测试。
 * 覆盖：登录 → 建档 → 上传素材 → 提交生成 → 轮询 → 保存作品。
 *
 * 用法（需要 API 与 worker 都在本地运行）：
 *   node scripts/smoke.mjs
 *   BASE=http://127.0.0.1:3000 node scripts/smoke.mjs
 *
 * 注意：Node 的 fetch 不走 HTTP_PROXY，不会受本地代理环境影响。
 */

const BASE = process.env.BASE || 'http://127.0.0.1:3000';

let token = '';

async function call(method, path, body, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', 'x-client': 'smoke-test', ...extraHeaders };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(`${method} ${path} 失败 ${response.status}：${JSON.stringify(json)}`);
  }
  return json.data;
}

const step = (message) => console.log(`\n▸ ${message}`);

/** 等待服务就绪，避免脚本比服务先跑起来导致 fetch failed */
async function waitForServer(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/healthz`);
      if (response.ok) return;
      lastError = `状态码 ${response.status}`;
    } catch (error) {
      lastError = error.cause?.message || error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`服务未就绪：${BASE}（${lastError}）`);
}

// 1x1 透明 PNG，够用且不需要外部依赖
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  step(`等待服务就绪 ${BASE}`);
  await waitForServer();

  step('登录（dev-login）');
  const login = await call('POST', '/v1/auth/dev-login', {
    provider: 'wechat_mp',
    uid: `smoke-${Date.now()}`,
    // 验证仅微信身份、未绑定手机号时也能完成创作闭环。
    nickname: '冒烟测试'
  });
  token = login.accessToken;
  if (login.user.phoneBound !== false) throw new Error('冒烟账号不应绑定手机号');
  console.log('  userId:', login.user.id, '| 手机号已绑定:', login.user.phoneBound);

  step('读取模板与额度');
  const templates = await call('GET', '/v1/meta/templates');
  console.log('  模板数:', templates.items.length);
  const quota = await call('GET', '/v1/meta/quota');
  console.log('  剩余次数:', quota.quota.remaining);

  step('创建猫咪档案');
  const created = await call('POST', '/v1/cats', {
    name: '布丁',
    gender: '母',
    breed: '中华田园猫',
    coat: '纯黑',
    traits: ['好奇', '傲娇'],
    personality: '嘴硬心软，喜欢观察主人',
    likes: ['晒太阳', '纸箱'],
    dislikes: ['洗澡']
  });
  const catId = created.cat.id;
  console.log('  catId:', catId, '| 默认:', created.cat.isDefault);

  step('申请上传签名并直传');
  const sign = await call('POST', '/v1/uploads/sign', {
    purpose: 'input',
    mime: 'image/png',
    byteSize: PNG_1PX.length
  });
  const put = await fetch(sign.uploadUrl, {
    method: 'PUT',
    headers: sign.headers,
    body: PNG_1PX
  });
  console.log('  PUT 状态:', put.status);
  if (!put.ok) throw new Error('上传失败');

  const done = await call('POST', `/v1/uploads/${sign.assetId}/complete`, {});
  console.log('  素材状态:', done.status);

  step('提交生成任务');
  const job = await call('POST', '/v1/generations', {
    templateKey: 'shape',
    catIds: [catId],
    assetIds: [sign.assetId],
    options: { mood: '温暖治愈' }
  });
  console.log('  jobId:', job.jobId, '| 今日剩余:', job.remainingToday);

  step('轮询结果');
  let final = null;
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    final = await call('GET', `/v1/generations/${job.jobId}`);
    if (final.status === 'succeeded' || final.status === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.stdout.write('.');
  }
  console.log('\n  最终状态:', final?.status);
  if (final?.status !== 'succeeded') {
    throw new Error(`生成未成功：${JSON.stringify(final?.error)}`);
  }
  console.log('  作品 ID:', final.workId);
  console.log('  图片地址:', final.result.image.url);

  step('保存作品并校验列表');
  await call('POST', `/v1/works/${final.workId}/save`, {});
  const works = await call('GET', '/v1/works');
  console.log('  作品库数量:', works.items.length);

  step('额度扣减校验');
  const after = await call('GET', '/v1/meta/quota');
  if (after.quota.usedToday !== quota.quota.usedToday + 1) throw new Error('生成后未正确扣减额度');
  console.log('  今日已用:', after.quota.usedToday, '/', after.quota.dailyLimit);

  console.log('\n✅ 冒烟测试全部通过');
}

main().catch((error) => {
  console.error('\n❌', error.message);
  process.exit(1);
});
