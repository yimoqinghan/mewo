/**
 * 多端账号合并验证。
 *
 * 场景：
 *   1. 用户在 H5 注册并绑定手机号，建了一只猫
 *   2. 该用户第一次进微信小程序，用同一手机号登录
 *      → 必须落到同一个 user，看到同一只猫
 *   3. 另一个人只用抖音登录，不绑手机号
 *      → 必须是独立 user，看不到上面的猫
 *
 * 这正是「多端共用一套数据」的核心契约，改动账号逻辑后必须重跑。
 */

const BASE = process.env.BASE || 'http://127.0.0.1:3000';

async function call(method, path, body, token) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await response.json();
  if (!json.ok) throw new Error(`${path} ${response.status} ${JSON.stringify(json)}`);
  return json.data;
}

const assert = (condition, message) => {
  if (!condition) throw new Error(`断言失败：${message}`);
  console.log(`  ✓ ${message}`);
};

async function main() {
  const phone = `138${String(Date.now()).slice(-8)}`;

  console.log('\n▸ 1. H5 侧注册并建档');
  const h5 = await call('POST', '/v1/auth/dev-login', {
    provider: 'h5',
    uid: `h5-${Date.now()}`,
    phone,
    nickname: '荒大人'
  });
  const cat = await call('POST', '/v1/cats', { name: '奶糖', breed: '布偶' }, h5.accessToken);
  console.log(`  userId=${h5.user.id} catId=${cat.cat.id}`);

  console.log('\n▸ 2. 微信小程序用同一手机号登录');
  const wx = await call('POST', '/v1/auth/dev-login', {
    provider: 'wechat_mp',
    uid: `wx-${Date.now()}`,
    phone,
    nickname: '荒大人'
  });
  assert(wx.user.id === h5.user.id, '两次登录落到同一个 user');
  assert(wx.user.phoneMasked === h5.user.phoneMasked, '手机号脱敏展示一致');

  const wxCats = await call('GET', '/v1/cats', undefined, wx.accessToken);
  assert(wxCats.items.length === 1, '微信端能看到 H5 建的猫');
  assert(wxCats.items[0].id === cat.cat.id, '猫咪 ID 一致，确认是同一份数据');

  const me = await call('GET', '/v1/auth/me', undefined, wx.accessToken);
  const providers = me.identities.map((item) => item.provider).sort();
  assert(providers.includes('h5') && providers.includes('wechat_mp'), '账号下同时挂载 h5 与 wechat_mp 身份');

  console.log('\n▸ 3. 另一个抖音用户（未绑手机号）');
  const dy = await call('POST', '/v1/auth/dev-login', {
    provider: 'douyin_mp',
    uid: `dy-${Date.now()}`,
    nickname: '路人'
  });
  assert(dy.user.id !== h5.user.id, '抖音账号与微信账号相互独立');

  const dyCats = await call('GET', '/v1/cats', undefined, dy.accessToken);
  assert(dyCats.items.length === 0, '抖音新用户看不到别人的猫');

  console.log('\n▸ 4. 无效 phoneCode 必须被拒绝');
  const conflict = await fetch(`${BASE}/v1/auth/phone/bind`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${dy.accessToken}` },
    body: JSON.stringify({ phoneCode: 'invalid' })
  });
  const conflictBody = await conflict.json();
  assert(conflictBody.ok === false && conflict.status >= 400, `无效 phoneCode 被拒绝（${conflict.status} ${conflictBody?.error?.code}）`);

  console.log('\n▸ 5. 无权访问他人资源');
  const forbidden = await fetch(`${BASE}/v1/cats/${cat.cat.id}`, {
    headers: { authorization: `Bearer ${dy.accessToken}` }
  });
  assert(forbidden.status === 404, '跨用户读取猫咪档案被拒（404 而非泄露存在性）');

  console.log('\n▸ 6. 微信账号无需手机号即可建档并恢复资料');
  const uid = `wx-no-phone-${Date.now()}`;
  const unbound = await call('POST', '/v1/auth/dev-login', { provider: 'wechat_mp', uid });
  assert(unbound.user.phoneBound === false, '微信账号未绑定手机号');
  const ownCat = await call('POST', '/v1/cats', { name: '微信小猫' }, unbound.accessToken);
  await call('PATCH', `/v1/cats/${ownCat.cat.id}`, { name: '微信小猫改名' }, unbound.accessToken);
  await call('POST', '/v1/auth/logout', { refreshToken: unbound.refreshToken });
  const relogin = await call('POST', '/v1/auth/dev-login', { provider: 'wechat_mp', uid });
  assert(relogin.user.id === unbound.user.id, '同一微信身份重新登录仍为同一账号');
  const ownCats = await call('GET', '/v1/cats', undefined, relogin.accessToken);
  assert(ownCats.items.length === 1 && ownCats.items[0].id === ownCat.cat.id && ownCats.items[0].name === '微信小猫改名', '未绑手机号账号可创建、修改并找回档案');

  const otherRead = await fetch(`${BASE}/v1/cats/${cat.cat.id}`, {
    headers: { authorization: `Bearer ${relogin.accessToken}` }
  });
  assert(otherRead.status === 404, '未绑手机号账号仍不能读取他人档案');
  const otherWrite = await fetch(`${BASE}/v1/cats/${cat.cat.id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${relogin.accessToken}` },
    body: JSON.stringify({ name: '不应生效' })
  });
  assert(otherWrite.status === 404, '未绑手机号账号仍不能修改他人档案');

  // 缺少照片必须进入正常业务校验，不能先被手机号门槛拦截。
  const sticker = await fetch(`${BASE}/v1/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${relogin.accessToken}` },
    body: JSON.stringify({ templateKey: 'pet-sticker', catIds: [ownCat.cat.id], requestKey: `test-${Date.now()}` })
  });
  assert((await sticker.json()).error?.code === 'INPUT_MISSING', '未绑手机号账号可进入贴纸生成业务校验');

  for (const [path, body] of [
    ['/v1/cats', { name: '未登录小猫' }],
    ['/v1/uploads/sign', { purpose: 'input', mime: 'image/png', byteSize: 10 }],
    ['/v1/generations', { templateKey: 'shape', catIds: [ownCat.cat.id] }]
  ]) {
    const anonymous = await fetch(`${BASE}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    });
    assert(anonymous.status === 401, `${path} 仍拒绝未登录请求`);
  }

  console.log('\n✅ 多端账号契约验证通过');
}

main().catch((error) => {
  console.error('\n❌', error.message);
  process.exit(1);
});
