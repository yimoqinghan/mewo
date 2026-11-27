// 在隔离测试库执行：通过真实页面保存逻辑与 API 验证档案字段往返。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildApp } from '../src/app.js';
import { closePool } from '../src/db/pool.js';

const app = await buildApp();
try {
  const login = await app.inject({ method: 'POST', url: '/v1/auth/dev-login', payload: { provider: 'wechat_mp', uid: `cat-profile-${Date.now()}` } });
  assert.equal(login.statusCode, 200);
  const headers = { authorization: `Bearer ${login.json().data.accessToken}` };
  async function call(method, url, payload) {
    const res = await app.inject({ method, url, payload, headers });
    const body = res.json();
    if (!body.ok) throw Object.assign(new Error(body.error.message), { code: body.error.code });
    return body.data;
  }
  let cats = [];
  let message = '';
  const storage = { getCats: () => cats, saveCats: items => { cats = items; }, getCurrentCatId: () => '', setCurrentCatId: () => {} };
  const api = {
    isLoggedIn: () => true,
    createCat: payload => call('POST', '/v1/cats', payload),
    updateCat: (id, payload) => call('PATCH', `/v1/cats/${id}`, payload),
    normalizeCat: cat => ({ ...cat, traits: cat.traits.join(' · ') }),
    syncCats: async () => { cats = (await call('GET', '/v1/cats')).items.map(api.normalizeCat); return cats; },
    isLoginError: () => false
  };
  let page;
  const dependencies = {
    '../../utils/storage': storage,
    '../../services/api': api,
    '../../utils/adapter': { showToast: value => { message = value; }, navigateBack: async () => {} },
    '../../utils/assets': { asset: value => value }
  };
  const source = await readFile(new URL('../../miniprogram/pages/cat-edit/cat-edit.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, {
    require: name => dependencies[name], Page: definition => { page = definition; }, setTimeout: () => {}
  });
  page.setData = values => Object.assign(page.data, values);
  page.data.form = { name: '测试猫', age: '1', traits: '布偶', personality: '调皮 矫情 粘人 古怪' };
  await page.save();
  assert.equal(message, '已保存', `截图场景保存失败：${message}`);
  assert.equal(cats.length, 1);
  assert.equal(cats[0].age, '1');
  assert.equal(cats[0].birthday, null);
  const id = cats[0].id;
  await page.onLoad({ id });
  assert.equal(page.data.form.age, '1');
  page.data.form.age = '1岁6个月';
  await page.save();
  assert.equal(message, '已保存');
  assert.equal(cats[0].age, '1岁6个月');
  page.data.form.age = '';
  await page.save();
  assert.equal(cats[0].age, '');
  console.log('✓ 截图场景保存成功，年龄重新编辑可回显、更新及清空');

  for (const birthday of ['1', '2026-02-30', '2026-13-01']) {
    for (const [method, url] of [['POST', '/v1/cats'], ['PATCH', `/v1/cats/${id}`]]) {
      const res = await app.inject({ method, url, headers, payload: { name: '日期测试猫', birthday } });
      assert.equal(res.statusCode, 400, `非法生日 ${birthday} 应返回 400`);
      assert.equal(res.json().error.code, 'VALIDATION_FAILED');
    }
  }
  const updated = await call('PATCH', `/v1/cats/${id}`, { birthday: '2024-02-29' });
  assert.ok(String(updated.cat.birthday).startsWith('2024-02-29'));
  console.log('✓ 非法生日返回参数错误，合法闰日可保存');
} finally {
  await app.close();
  await closePool();
}
