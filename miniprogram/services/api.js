const adapter = require('../utils/adapter');
const http = require('../utils/request');
const env = require('../config/env');
const storage = require('../utils/storage');
const { asset } = require('../utils/assets');
const cloudApi = env.useCloud ? require('./cloud-api') : null;

/**
 * 服务端 API 封装。微信与抖音小程序共用这一份，
 * 差异只体现在 adapter 里。
 *
 * 约定：所有方法返回 Promise，失败时抛出的 Error 带 code 字段，
 * 页面根据 code 决定是提示、重试还是引导登录。
 */

// ---------------- 登录 ----------------

/** 小程序登录：自动适配微信 / 抖音 */
async function login(options = {}) {
  const code = await adapter.login();
  const path = adapter.isDouyin
    ? '/v1/auth/douyin/miniprogram'
    : '/v1/auth/wechat/miniprogram';

  const data = await http.request({ path, method: 'POST', data: { code, ...options }, needAuth: false });
  http.setTokens(data);
  storage.setUser(data.user);
  return data;
}

/** 登录态失效时重新走一次小程序登录 */
async function ensureLogin() {
  if (!http.hasSession()) throw Object.assign(new Error('请先登录'), {code:'LOGIN_REQUIRED'});
  const data=await getMe();
  storage.setUser(data.user);
  return data;
}
async function logout() {
  try { await http.request({path:'/v1/auth/logout',method:'POST',data:{refreshToken:http.getRefreshToken()},needAuth:false}); }
  finally { http.clearTokens();storage.clearUser(); }
}

// ---------------- 元信息 ----------------

const getTemplates = () => http.request({ path: '/v1/meta/templates' });
const getConfig = () => http.request({ path: '/v1/meta/config', needAuth: false });
const getQuota = () => http.request({ path: '/v1/meta/quota' });
const getMe = () => http.request({ path: '/v1/auth/me' });

// ---------------- 猫咪档案 ----------------

const listCats = (includeArchived) =>
  http.request({ path: `/v1/cats${includeArchived ? '?includeArchived=true' : ''}` });

const getCat = (catId) => http.request({ path: `/v1/cats/${catId}` });

const createCat = (payload) => http.request({ path: '/v1/cats', method: 'POST', data: payload });

const updateCat = (catId, payload) =>
  http.request({ path: `/v1/cats/${catId}`, method: 'PATCH', data: payload });

const archiveCat = (catId) => http.request({ path: `/v1/cats/${catId}`, method: 'DELETE' });

const restoreCat = (catId) =>
  http.request({ path: `/v1/cats/${catId}/restore`, method: 'POST' });

const setDefaultCat = (catId) =>
  http.request({ path: `/v1/cats/${catId}/default`, method: 'POST' });

const createCatShareQr = (catId) =>
  http.request({ path: `/v1/cats/${encodeURIComponent(catId)}/share-qr`, method: 'POST', data: {} });

const getPublicCatShare = (shareCode) =>
  http.request({
    path: `/v1/cats/public-share/${encodeURIComponent(shareCode)}`,
    needAuth: false
  });

const savePersona = (catId, payload) =>
  http.request({ path: `/v1/cats/${catId}/persona`, method: 'PUT', data: payload });

// ---------------- 素材上传 ----------------

/**
 * 直传对象存储。三步：
 *   1. 向服务端要预签名地址
 *   2. 本地读文件后直接 PUT 到存储
 *   3. 回调服务端确认
 * 全程图片不经过业务服务器，省带宽也更快。
 */
async function uploadImage(filePath, purpose = 'input') {
  const info = await getFileInfo(filePath);

  const signed = await http.request({
    path: '/v1/uploads/sign',
    method: 'POST',
    data: { purpose, mime: info.mime, byteSize: info.size }
  });

  const buffer = await adapter.readFileAsArrayBuffer(filePath);

  const putResult = await adapter.request({
    url: signed.uploadUrl,
    method: signed.method || 'PUT',
    data: buffer,
    header: signed.headers,
    timeout: 60000
  });

  if (putResult.statusCode < 200 || putResult.statusCode >= 300) {
    const error = new Error('图片上传失败，请重试');
    error.code = 'UPLOAD_FAILED';
    throw error;
  }

  await http.request({
    path: `/v1/uploads/${signed.assetId}/complete`,
    method: 'POST',
    data: {}
  });

  return signed.assetId;
}

const importImageUrl = (sourceUrl, purpose = 'input') =>
  http.request({ path: '/v1/uploads/import-static', method: 'POST', data: { sourceUrl, purpose } });

async function uploadAudio(filePath) {
  const size = await adapter.getFileSize(filePath);
  if (size > 10 * 1024 * 1024) throw new Error('录音不能超过 10MB');
  const signed = await http.request({
    path: '/v1/uploads/sign',
    method: 'POST',
    data: { purpose: 'voice', mime: 'audio/mpeg', byteSize: size }
  });
  const buffer = await adapter.readFileAsArrayBuffer(filePath);
  const result = await adapter.request({ url: signed.uploadUrl, method: signed.method || 'PUT', data: buffer, header: signed.headers, timeout: 60000 });
  if (result.statusCode < 200 || result.statusCode >= 300) throw Object.assign(new Error('录音上传失败，请重试'), { code: 'UPLOAD_FAILED' });
  await http.request({ path: `/v1/uploads/${signed.assetId}/complete`, method: 'POST', data: {} });
  return signed.assetId;
}

async function uploadVideo(filePath) {
  const size = await adapter.getFileSize(filePath);
  if (size > 50 * 1024 * 1024) throw new Error('视频不能超过 50MB，请选择较短的视频');
  const signed = await http.request({
    path: '/v1/uploads/sign',
    method: 'POST',
    data: { purpose: 'input', mime: 'video/mp4', byteSize: size }
  });
  const buffer = await adapter.readFileAsArrayBuffer(filePath);
  const result = await adapter.request({ url: signed.uploadUrl, method: signed.method || 'PUT', data: buffer, header: signed.headers, timeout: 120000 });
  if (result.statusCode < 200 || result.statusCode >= 300) throw Object.assign(new Error('视频上传失败，请重试'), { code: 'UPLOAD_FAILED' });
  await http.request({ path: `/v1/uploads/${signed.assetId}/complete`, method: 'POST', data: {} });
  return signed.assetId;
}

const transcribeAudio = (assetId) =>
  http.request({ path: '/v1/transcriptions', method: 'POST', data: { assetId } });

const analyzeCatVideo = (payload) =>
  http.request({ path: '/v1/cat-translations', method: 'POST', data: payload });

const analyzeCatImage = (payload) =>
  http.request({ path: '/v1/cat-translations', method: 'POST', data: { ...payload, kind: 'image' } });

const analyzeCatAudio = (payload) =>
  http.request({ path: '/v1/cat-translations', method: 'POST', data: { ...payload, kind: 'audio' } });

const createCatSpeech = (payload) =>
  http.request({ path: '/v1/cat-speech', method: 'POST', data: payload });

/** 取文件真实大小；拿不到就返回 0，交给服务端按实际对象校验 */
async function getFileInfo(filePath) {
  const extension = String(filePath || '').match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i)?.[1]?.toLowerCase() || '';
  let image = null;
  let size = 0;
  try {
    image = await adapter.getImageInfo(filePath);
  } catch (error) {
    // 某些微信开发者工具版本无法对 downloadFile 返回的 WebP 临时文件调用 getImageInfo，
    // 但文件仍然可以正常读取和直传；此时用扩展名推断 MIME，避免把可用图片误报为读取失败。
    if (!extension) {
      throw Object.assign(new Error('无法读取照片，请重新选择 JPG、PNG 或 WebP 图片'), {
        code: 'IMAGE_READ_FAILED',
        cause: error
      });
    }
  }
  try {
    size = await adapter.getFileSize(filePath);
  } catch {
    // 无法 stat 时让服务端按对象实际大小校验。
    size = 0;
  }
  const types={jpeg:'image/jpeg',jpg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const mime=types[(image?.type || extension).toLowerCase()];
  if(!mime)throw new Error('请选择 JPG、PNG 或 WebP 图片');
  if(size>10*1024*1024)throw new Error('照片不能超过 10MB，请选择较小的照片');
  return {mime,size};
}

// ---------------- 生成 ----------------

const createGeneration = (payload) =>
  http.request({ path: '/v1/generations', method: 'POST', data: payload });

const getGeneration = (jobId) => http.request({ path: `/v1/generations/${jobId}` });

const cancelGeneration = (jobId) =>
  http.request({ path: `/v1/generations/${jobId}/cancel`, method: 'POST' });

const sendChat = (payload) =>
  http.request({ path: '/v1/chats', method: 'POST', data: payload });

const listChatMessages = (catId, limit = 200) =>
  http.request({ path: `/v1/chats/history?catId=${encodeURIComponent(catId)}&limit=${limit}` });

const importChatMessages = (catId, messages) =>
  http.request({ path: '/v1/chats/history', method: 'POST', data: { catId, messages } });

const deleteChatMessages = (catId) =>
  http.request({ path: `/v1/chats/history?catId=${encodeURIComponent(catId)}`, method: 'DELETE' });

/**
 * 轮询直到出结果。
 * 默认最多等 90 秒，间隔 1.5 秒起、逐步拉长，
 * 既保证出图后立刻可见，也不会把请求打爆。
 */
function waitForGeneration(jobId, options = {}) {
  const timeoutMs = options.timeoutMs || 150000;
  const onProgress = options.onProgress || (() => {});
  const deadline = Date.now() + timeoutMs;
  let interval = 1500;

  return new Promise((resolve, reject) => {
    const poll = () => {
      if(options.shouldStop && options.shouldStop())return reject(Object.assign(new Error('已暂停查询'),{code:'POLL_STOPPED'}));
      getGeneration(jobId)
        .then((data) => {
          if(options.shouldStop && options.shouldStop())throw Object.assign(new Error('已暂停查询'),{code:'POLL_STOPPED'});
          onProgress(data);
          if (data.status === 'succeeded') return resolve(data);
          if (['failed', 'canceled', 'expired'].includes(data.status)) {
            const error = new Error(data.error?.message || '生成失败，请重试');
            error.code = data.error?.code || 'GENERATION_FAILED';
            return reject(error);
          }
          if (Date.now() > deadline) {
            const error = new Error('生成时间较长，请稍后到喵作查看');
            error.code = 'GENERATION_TIMEOUT';
            return reject(error);
          }
          interval = Math.min(interval + 500, 4000);
          setTimeout(poll, interval);
        })
        .catch(reject);
    };
    poll();
  });
}

// ---------------- 作品 ----------------

const listWorks = (params = {}) => {
  const query = [];
  if (params.saved === false) query.push('saved=false');
  if (params.catId) query.push(`catId=${params.catId}`);
  if (params.before) query.push(`before=${encodeURIComponent(params.before)}`);
  if (params.limit) query.push(`limit=${params.limit}`);
  return http.request({ path: `/v1/works${query.length ? `?${query.join('&')}` : ''}` });
};

const getWork = (workId) => http.request({ path: `/v1/works/${workId}` });

const saveWork = (workId) =>
  http.request({ path: `/v1/works/${workId}/save`, method: 'POST', data: {} });

const updateWork = (workId, payload) =>
  http.request({ path: `/v1/works/${workId}`, method: 'PATCH', data: payload });

const deleteWork = (workId) =>
  http.request({ path: `/v1/works/${workId}`, method: 'DELETE' });

const remoteApi = {
  env,
  login,
  ensureLogin,
  logout,
  getTemplates,
  getConfig,
  getQuota,
  getMe,
  listCats,
  getCat,
  createCat,
  updateCat,
  archiveCat,
  restoreCat,
  setDefaultCat,
  createCatShareQr,
  getPublicCatShare,
  savePersona,
  uploadImage,
  importImageUrl,
  uploadAudio,
  uploadVideo,
  transcribeAudio,
  analyzeCatVideo,
  analyzeCatImage,
  analyzeCatAudio,
  createCatSpeech,
  createGeneration,
  getGeneration,
  cancelGeneration,
  sendChat,
  listChatMessages,
  importChatMessages,
  deleteChatMessages,
  waitForGeneration,
  listWorks,
  getWork,
  saveWork,
  updateWork,
  deleteWork
};


function normalizeCat(cat) {
  return {
    ...cat,
    avatarAssetId: cat.avatar?.assetId || cat.avatarAssetId || '',
    avatar: cat.avatar && cat.avatar.url || asset('design-webp/cat-home.webp'),
    traits: Array.isArray(cat.traits) ? cat.traits.join(' · ') : (cat.traits || '')
  };
}
remoteApi.syncCats = async function () {
  await ensureLogin();
  const localCats = storage.getCats();
  const localById = new Map(localCats.map((cat) => [cat.id, cat]));
  const data=await listCats(); const cats=data.items.map((cat) => ({ ...normalizeCat(cat), photos: localById.get(cat.id)?.photos || [], humanRole: localById.get(cat.id)?.humanRole || '', speechStyle: localById.get(cat.id)?.speechStyle || '', catchphrase: localById.get(cat.id)?.catchphrase || '' }));
  storage.saveCats(cats);
  if(!cats.some(c=>c.id===storage.getCurrentCatId()))storage.setCurrentCatId((cats.find(c=>c.isDefault)||cats[0]||{}).id||'');
  return cats;
};
remoteApi.normalizeCat=normalizeCat;
remoteApi.isLoggedIn=()=>http.hasSession() && Boolean(storage.getUser() && storage.getUser().id);
remoteApi.isLoginError=e=>['LOGIN_REQUIRED','PHONE_REQUIRED','UNAUTHORIZED'].includes(e.code);
remoteApi.openLogin=()=>adapter.navigateTo('/pages/login/login');
remoteApi.freshWorkImage=async id=>{const data=await getWork(id);if(!data.work.cover || !data.work.cover.url)throw new Error('图片暂时无法读取');return data.work.cover.url;};

module.exports = env.useCloud ? cloudApi : remoteApi;
