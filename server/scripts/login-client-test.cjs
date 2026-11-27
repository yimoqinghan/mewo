// 无需微信运行时，验证登录页面交互和未绑定手机号账号的客户端会话。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function load(relativePath, dependencies, globals = {}) {
  const context = {
    module: { exports: {} }, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `未声明测试依赖：${name}`);
      return dependencies[name];
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), context);
  return context.module.exports;
}

async function main() {
  let session = false;
  let user = null;
  let savedCats = null;
  const requests = [];
  const api = load('miniprogram/services/api.js', {
    '../utils/adapter': { login: async () => 'test-wechat-code' },
    '../config/env': {},
    '../utils/assets': { asset: value => value },
    '../utils/storage': {
      setUser: value => { user = value; }, getUser: () => user,
      saveCats: value => { savedCats = value; }, getCurrentCatId: () => '', setCurrentCatId: () => {}
    },
    '../utils/request': {
      hasSession: () => session, setTokens: () => { session = true; },
      request: async options => {
        requests.push(options);
        if (options.path === '/v1/auth/wechat/miniprogram') return { accessToken: 'test-token', user: { id: 'wechat-user', phoneBound: false } };
        if (options.path === '/v1/auth/me') return { user };
        if (options.path === '/v1/cats') return { items: [] };
        throw new Error(`意外请求：${options.path}`);
      }
    }
  });
  await assert.rejects(api.ensureLogin(), error => error.code === 'LOGIN_REQUIRED');
  await api.login();
  assert.equal(JSON.stringify(requests[0].data), JSON.stringify({ code: 'test-wechat-code' }));
  assert.equal(api.isLoggedIn(), true);
  await api.syncCats();
  assert.equal(savedCats.length, 0);
  session = false;
  assert.equal(api.isLoggedIn(), false);
  await assert.rejects(api.ensureLogin(), error => error.code === 'LOGIN_REQUIRED');
  console.log('✓ 微信 code 登录、不绑定手机号也能同步、退出后会话失效');

  let page;
  let loginCalls = 0;
  let syncCalls = 0;
  let navigated = 0;
  let resolveLogin;
  let loginImplementation = () => Promise.resolve();
  load('miniprogram/pages/login/login.js', {
    '../../services/api': {
      login: (...args) => { assert.equal(args.length, 0); loginCalls++; return loginImplementation(); },
      syncCats: async () => { syncCalls++; }
    },
    '../../utils/assets': { asset: value => value },
    '../../utils/adapter': { showToast: () => {}, navigateBack: async () => { navigated++; } }
  }, { Page: definition => { page = definition; } });
  page.setData = values => Object.assign(page.data, values);
  await page.login();
  assert.equal(loginCalls, 0);
  page.toggleAgreement();
  page.data.configured = false;
  await page.login();
  assert.equal(loginCalls, 0);
  page.data.configured = true;
  loginImplementation = () => new Promise(resolve => { resolveLogin = resolve; });
  const pending = page.login();
  assert.equal(page.data.busy, true);
  await page.login();
  assert.equal(loginCalls, 1);
  resolveLogin();
  await pending;
  assert.equal(page.data.busy, false);
  assert.equal(syncCalls, 1);
  assert.equal(navigated, 1);
  loginImplementation = async () => { throw { errMsg: 'login:fail 测试网络异常' }; };
  await page.login();
  assert.equal(page.data.error, 'login:fail 测试网络异常');
  assert.equal(page.data.busy, false);
  assert.equal(navigated, 1);
  loginImplementation = async () => {};
  await page.login();
  assert.equal(page.data.error, '');
  assert.equal(navigated, 2);
  console.log('✓ 同意门槛、配置门槛、防重复提交、失败提示和重试');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
