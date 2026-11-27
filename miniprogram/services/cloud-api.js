const adapter = require('../utils/adapter');
const env = require('../config/env');
const storage = require('../utils/storage');
const { asset } = require('../utils/assets');

const SESSION_KEY = 'ym_cloud_session';

function cloudError(result) {
  const payload = result && result.result ? result.result : result;
  const error = new Error(payload?.error?.message || '云服务暂时不可用，请稍后重试');
  error.code = payload?.error?.code || 'CLOUD_FUNCTION_ERROR';
  error.details = payload?.error?.details;
  return error;
}

async function call(action, data = {}) {
  const response = await adapter.callCloudFunction('meow-api', { action, ...data });
  const result = response?.result || response;
  if (!result?.ok) throw cloudError(result);
  return result.data;
}

async function fileUrls(fileIds) {
  const ids = [...new Set((fileIds || []).filter(Boolean))];
  if (!ids.length) return new Map();
  const response = await adapter.cloudGetTempFileURL(ids);
  const map = new Map();
  (response.fileList || []).forEach((item) => {
    if (item.tempFileURL) map.set(item.fileID, item.tempFileURL);
  });
  return map;
}

function normalizeCat(cat, urls = new Map()) {
  const fileId = cat.avatarFileId || '';
  return {
    ...cat,
    age: cat.age || '',
    avatarAssetId: cat.avatarAssetId || '',
    traits: Array.isArray(cat.traits) ? cat.traits.join(' · ') : (cat.traits || ''),
    avatar: fileId ? { assetId: cat.avatarAssetId || '', url: urls.get(fileId) || null } : asset('design-webp/cat-home.webp')
  };
}

async function listCats(includeArchived = false) {
  const data = await call('listCats', { includeArchived });
  const urls = await fileUrls(data.items.map((cat) => cat.avatarFileId));
  return { items: data.items.map((cat) => normalizeCat(cat, urls)) };
}

async function syncCats() {
  await ensureLogin();
  const data = await listCats();
  const localCats = storage.getCats();
  const localById = new Map(localCats.map((cat) => [cat.id, cat]));
  const cats = (data.items || []).map((cat) => ({ ...cat, photos: localById.get(cat.id)?.photos || [], humanRole: localById.get(cat.id)?.humanRole || '', speechStyle: localById.get(cat.id)?.speechStyle || '', catchphrase: localById.get(cat.id)?.catchphrase || '' }));
  storage.saveCats(cats);
  if (!cats.some((cat) => cat.id === storage.getCurrentCatId())) {
    storage.setCurrentCatId((cats.find((cat) => cat.isDefault) || cats[0] || {}).id || '');
  }
  return cats;
}

async function getCat(catId) {
  const data = await call('getCat', { catId });
  const urls = await fileUrls([data.cat.avatarFileId]);
  return { ...data, cat: normalizeCat(data.cat, urls) };
}

async function saveCat(payload) {
  const data = await call('saveCat', { cat: payload });
  const urls = await fileUrls([data.cat.avatarFileId]);
  return { ...data, cat: normalizeCat(data.cat, urls) };
}

async function getWork(workId) {
  const data = await call('getWork', { workId });
  const urls = await fileUrls([data.work.imageFileId]);
  return {
    work: {
      ...data.work,
      cover: data.work.imageFileId
        ? { assetId: data.work.imageFileId, url: urls.get(data.work.imageFileId) || null }
        : null,
      saved: Boolean(data.work.saved)
    }
  };
}

async function listWorks(params = {}) {
  const data = await call('listWorks', params);
  const urls = await fileUrls(data.items.map((work) => work.imageFileId));
  return {
    items: data.items.map((work) => ({
      ...work,
      cover: work.imageFileId
        ? { assetId: work.imageFileId, url: urls.get(work.imageFileId) || null }
        : null,
      cats: work.catName ? [{ id: work.catId, name: work.catName }] : []
    }))
  };
}

async function login() {
  adapter.initCloud(env.cloudEnvId);
  const data = await call('getMe');
  adapter.storageSet(SESSION_KEY, true);
  storage.setUser(data.user);
  return data;
}

async function ensureLogin() {
  if (!isLoggedIn()) throw Object.assign(new Error('请先登录'), { code: 'LOGIN_REQUIRED' });
  const data = await call('getMe');
  storage.setUser(data.user);
  return data;
}

async function logout() {
  adapter.storageRemove(SESSION_KEY);
  storage.clearUser();
}

const getConfig = () => call('getConfig');
const getQuota = () => call('getQuota');
const getMe = () => call('getMe');
const createCat = saveCat;
const updateCat = (catId, payload) => saveCat({ ...payload, id: catId });
const archiveCat = (catId) => call('archiveCat', { catId });
const restoreCat = (catId) => call('restoreCat', { catId });
const setDefaultCat = (catId) => call('setDefaultCat', { catId });
const savePersona = (catId, payload) => call('savePersona', { catId, persona: payload });

async function uploadImage(filePath, purpose = 'input') {
  const uploaded = await adapter.cloudUploadFile(filePath);
  return (await call('registerAsset', { fileId: uploaded.fileID, purpose })).assetId;
}

async function createGeneration(payload) {
  const data = await call('createGeneration', {
    ...payload,
    catId: payload.catIds?.[0],
    assetId: payload.assetIds?.[0]
  });
  return { ...data, jobId: data.jobId || data.taskId };
}

const getGeneration = (jobId) => call('getGeneration', { taskId: jobId }).then((data) => ({ ...data, jobId: data.jobId || data.taskId }));
const cancelGeneration = (jobId) => call('cancelGeneration', { taskId: jobId });
const sendChat = (payload) => call('chat', payload);

function waitForGeneration(jobId, options = {}) {
  const timeoutMs = options.timeoutMs || 150000;
  const onProgress = options.onProgress || (() => {});
  const deadline = Date.now() + timeoutMs;
  let interval = 1000;
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (options.shouldStop && options.shouldStop()) return reject(Object.assign(new Error('已暂停查询'), { code: 'POLL_STOPPED' }));
      getGeneration(jobId).then((data) => {
        onProgress(data);
        if (data.status === 'succeeded') return resolve(data);
        if (['failed', 'canceled', 'expired'].includes(data.status)) {
          return reject(Object.assign(new Error(data.error?.message || '生成失败，请重试'), { code: data.error?.code || 'GENERATION_FAILED' }));
        }
        if (Date.now() > deadline) return reject(Object.assign(new Error('生成时间较长，请稍后到喵作查看'), { code: 'GENERATION_TIMEOUT' }));
        interval = Math.min(interval + 500, 4000);
        setTimeout(poll, interval);
      }).catch(reject);
    };
    poll();
  });
}

const saveWork = (workId) => call('saveWork', { workId });

function isLoggedIn() {
  return Boolean(adapter.storageGet(SESSION_KEY, false) && storage.getUser());
}

const isLoginError = (error) => ['LOGIN_REQUIRED', 'UNAUTHORIZED', 'CLOUD_NOT_READY'].includes(error?.code);
const openLogin = () => adapter.navigateTo('/pages/login/login');

module.exports = {
  env, login, ensureLogin, logout, getConfig, getQuota, getMe, listCats, getCat, createCat,
  updateCat, archiveCat, restoreCat, setDefaultCat, savePersona, uploadImage, createGeneration,
  getGeneration, cancelGeneration, sendChat, waitForGeneration, listWorks, getWork, saveWork,
  normalizeCat, syncCats, isLoggedIn, isLoginError, openLogin
};
