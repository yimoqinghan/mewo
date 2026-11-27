const assert = require('assert');
const Module = require('module');

const originalLoad = Module._load;
const adapter = { navigateTo: async () => {} };
Module._load = function patchedLoad(request, parent, isMain) {
  if (request.endsWith('/utils/storage')) return { getCats: () => [], getCurrentCatId: () => '', setCurrentCatId: () => {} };
  if (request.endsWith('/utils/adapter')) return adapter;
  if (request.endsWith('/utils/assets')) return { asset: value => value };
  return originalLoad.call(this, request, parent, isMain);
};

let pageConfig;
global.Page = config => { pageConfig = config; };
require('../miniprogram/pages/index/index.js');
Module._load = originalLoad;

const instance = {
  ...pageConfig,
  data: JSON.parse(JSON.stringify(pageConfig.data)),
  setData(patch) {
    Object.entries(patch).forEach(([key, value]) => { this.data[key] = value; });
  }
};

instance.data.screenState = 'menu';
instance.openModule({ currentTarget: { dataset: { key: 'presence' } } });
assert.strictEqual(instance.data.menuView, 'submodules');
assert.strictEqual(instance.data.activeModule.key, 'presence');

instance.handleSubmodule({ currentTarget: { dataset: { key: 'calendar' } } });
assert.strictEqual(instance.data.screenState, 'menu', '进入二级页面前应保留菜单打开状态');
assert.strictEqual(instance.data.menuView, 'submodules', '进入二级页面前应保留当前二级模块');
assert.strictEqual(instance.data.activeModule.key, 'presence', '进入二级页面前应保留一级模块');

instance.introStarted = true;
instance.startBlinkLoop = () => {};
instance.onShow();
assert.strictEqual(instance.data.screenState, 'menu', '返回首页触发 onShow 后仍应保持菜单打开');
assert.strictEqual(instance.data.menuView, 'submodules', '返回首页触发 onShow 后仍应保持二级模块');
assert.strictEqual(instance.data.activeModule.key, 'presence', '返回首页触发 onShow 后仍应保持一级模块');
console.log('index menu state: passed');
