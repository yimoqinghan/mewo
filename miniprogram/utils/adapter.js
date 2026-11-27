/**
 * 平台适配层：把微信小程序与抖音小程序的差异收敛到这里。
 * 上层业务只调用 adapter.*，不直接出现 wx. 或 tt.。
 */

const { isRemotePath } = require('./media-source');

const isDouyin = typeof tt !== 'undefined' && typeof wx === 'undefined';
const host = isDouyin ? tt : wx;

/**
 * 客户端标识，服务端用来区分来源，写入 user_identity.meta 与生成任务。
 * 与后端 normalizeClient 的取值保持一致。
 */
const CLIENT_TAG = isDouyin ? 'mp-douyin' : 'mp-weixin';
let cloudReady = false;

function initCloud(envId) {
  if (isDouyin || !envId || !host.cloud || typeof host.cloud.init !== 'function') return false;
  if (!cloudReady) {
    host.cloud.init({ env: envId, traceUser: true });
    cloudReady = true;
  }
  return cloudReady;
}

function callCloudFunction(name, data) {
  return new Promise((resolve, reject) => {
    if (!cloudReady || !host.cloud || typeof host.cloud.callFunction !== 'function') {
      return reject(Object.assign(new Error('微信云服务尚未初始化'), { code: 'CLOUD_NOT_READY' }));
    }
    host.cloud.callFunction({ name, data: data || {}, success: resolve, fail: reject });
  });
}

function cloudUploadFile(filePath) {
  return new Promise((resolve, reject) => {
    if (!cloudReady || !host.cloud || typeof host.cloud.uploadFile !== 'function') {
      return reject(Object.assign(new Error('微信云存储尚未初始化'), { code: 'CLOUD_NOT_READY' }));
    }
    host.cloud.uploadFile({ cloudPath: `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`, filePath, success: resolve, fail: reject });
  });
}

function cloudGetTempFileURL(fileList) {
  return new Promise((resolve, reject) => {
    if (!cloudReady || !host.cloud || typeof host.cloud.getTempFileURL !== 'function') {
      return reject(Object.assign(new Error('微信云存储尚未初始化'), { code: 'CLOUD_NOT_READY' }));
    }
    host.cloud.getTempFileURL({ fileList, success: resolve, fail: reject });
  });
}

function storageGet(key, fallback) {
  try {
    const value = host.getStorageSync(key);
    return value === '' || value === undefined || value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    host.setStorageSync(key, value);
    return true;
  } catch (error) {
    return false;
  }
}

function storageRemove(key) {
  try {
    host.removeStorageSync(key);
  } catch (error) {
    // 忽略
  }
}

/** 统一的网络请求，回调风格转 Promise */
function request(options) {
  return new Promise((resolve, reject) => {
    host.request({
      url: options.url,
      method: options.method || 'GET',
      data: options.data,
      header: options.header || {},
      timeout: options.timeout || 20000,
      success: (res) => resolve(res),
      fail: (error) => reject(error)
    });
  });
}

/** 小程序登录，返回 code */
function login() {
  return new Promise((resolve, reject) => {
    host.login({
      success: (res) => resolve(res.code),
      fail: (error) => reject(error)
    });
  });
}

/** 选图，返回本地临时路径 */
function chooseImage(sourceType) {
  return chooseImages(sourceType, 1).then((paths) => paths[0] || '');
}

/** 选图，返回本地临时路径数组。相册可多选，相机始终只返回一张。 */
function chooseImages(sourceType, count = 9) {
  return new Promise((resolve, reject) => {
    host.chooseImage({
      count: Math.max(1, Math.min(Number(count) || 1, 9)),
      sizeType: ['compressed'],
      sourceType: sourceType || ['camera', 'album'],
      success: (res) => resolve(res.tempFilePaths || []),
      fail: (error) => reject(error)
    });
  });
}

/** 选择一段短视频，页面层不直接依赖 wx.chooseMedia / wx.chooseVideo。 */
function chooseVideo(options = {}) {
  return new Promise((resolve, reject) => {
    const sourceType = options.sourceType || ['camera', 'album'];
    const maxDuration = Math.max(3, Math.min(Number(options.maxDuration) || 30, 60));
    if (typeof host.chooseMedia === 'function') {
      host.chooseMedia({
        count: 1,
        mediaType: ['video'],
        sourceType,
        maxDuration,
        camera: options.camera || 'back',
        success: (res) => {
          const file = res.tempFiles?.[0];
          if (!file?.tempFilePath) return reject(Object.assign(new Error('没有读取到视频'), { code: 'VIDEO_EMPTY' }));
          resolve({ path: file.tempFilePath, duration: Number(file.duration) || 0, size: Number(file.size) || 0 });
        },
        fail: reject
      });
      return;
    }
    if (typeof host.chooseVideo === 'function') {
      host.chooseVideo({
        sourceType,
        maxDuration,
        camera: options.camera || 'back',
        success: (res) => resolve({ path: res.tempFilePath, duration: Number(res.duration) || 0, size: Number(res.size) || 0 }),
        fail: reject
      });
      return;
    }
    reject(Object.assign(new Error('当前版本暂不支持视频选择'), { code: 'NOT_SUPPORTED' }));
  });
}

/** 获取当前位置，页面层不直接依赖 wx.getLocation / tt.getLocation。 */
function getLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof host.getLocation !== 'function') {
      reject(Object.assign(new Error('当前版本暂不支持定位'), { code: 'NOT_SUPPORTED' }));
      return;
    }
    host.getLocation({
      type: options.type || 'gcj02',
      isHighAccuracy: false,
      success: resolve,
      fail: reject
    });
  });
}

/** 相机/画布上下文统一封装，页面层不直接依赖 wx/tt。 */
function createCameraContext(id) {
  if (typeof host.createCameraContext !== 'function') return null;
  return host.createCameraContext(id || 'capture-camera');
}

function createCanvasContext(id, page) {
  if (typeof host.createCanvasContext !== 'function') return null;
  return host.createCanvasContext(id, page);
}

let recorderManager = null;
let recorderPromise = null;

function recordAudio(options = {}) {
  if (typeof host.getRecorderManager !== 'function') {
    return Promise.reject(Object.assign(new Error('当前版本不支持录音'), { code: 'NOT_SUPPORTED' }));
  }
  if (recorderPromise) return Promise.reject(Object.assign(new Error('正在录音，请先结束当前录音'), { code: 'RECORDING' }));
  recorderManager = host.getRecorderManager();
  recorderPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      recorderManager?.offStop?.(handleStop);
      recorderManager?.offError?.(handleError);
      recorderPromise = null;
    };
    const handleStop = (result) => { cleanup(); resolve(result?.tempFilePath || ''); };
    const handleError = (error) => { cleanup(); reject(error); };
    recorderManager.onStop(handleStop);
    recorderManager.onError(handleError);
    recorderManager.start({ duration: options.duration || 60000, format: options.format || 'mp3', sampleRate: 16000, numberOfChannels: 1 });
  });
  return recorderPromise;
}

function stopRecording() {
  if (recorderManager && recorderPromise) recorderManager.stop();
}

/** 读取本地文件为 ArrayBuffer，用于直传对象存储 */
function readFileAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    if (isDouyin) {
      // 抖音的 readFile 需要显式 encoding
      host.getFileSystemManager().readFile({
        filePath,
        success: (res) => resolve(res.data),
        fail: reject
      });
      return;
    }
    host.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
}

/** 读取已下载的文本资源，例如可缓存的拍摄模板配置。 */
function readFileAsText(filePath) {
  return new Promise((resolve, reject) => {
    host.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success: (res) => resolve(String(res.data || '')),
      fail: reject
    });
  });
}

/** 把服务端返回的 base64 图片写入小程序用户目录，供 Canvas drawImage 使用。 */
function writeBase64File(data, extension = 'png') {
  const userDataPath = host.env?.USER_DATA_PATH;
  const fileManager = host.getFileSystemManager?.();
  if (!userDataPath || !fileManager?.writeFile) {
    return Promise.reject(Object.assign(new Error('当前版本暂不支持写入临时图片'), { code: 'NOT_SUPPORTED' }));
  }
  const raw = String(data || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) return Promise.reject(Object.assign(new Error('图片数据为空'), { code: 'IMAGE_EMPTY' }));
  const safeExtension = String(extension || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
  const filePath = `${userDataPath}/yanmiao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExtension}`;
  return new Promise((resolve, reject) => {
    fileManager.writeFile({
      filePath,
      data: raw,
      encoding: 'base64',
      success: () => resolve(filePath),
      fail: reject
    });
  });
}

function showToast(title, icon) {
  host.showToast({ title, icon: icon || 'none' });
}

module.exports = {
  isDouyin,
  clientTag: CLIENT_TAG,
  storageGet,
  storageSet,
  storageRemove,
  request,
  login,
  chooseImage,
  chooseImages,
  chooseVideo,
  getLocation,
  createCameraContext,
  createCanvasContext,
  recordAudio,
  stopRecording,
  readFileAsArrayBuffer,
  readFileAsText,
  writeBase64File,
  showToast
};

Object.assign(module.exports, { initCloud, callCloudFunction, cloudUploadFile, cloudGetTempFileURL });

// 媒体与界面能力统一封装；不支持的端明确报错，由页面给出替代操作。
function invoke(method, options) {
  return new Promise((resolve, reject) => {
    if (typeof host[method] !== 'function') return reject(Object.assign(new Error('当前版本暂不支持此功能'), { code: 'NOT_SUPPORTED' }));
    host[method]({ ...(options || {}), success: resolve, fail: reject });
  });
}
Object.assign(module.exports, {
  navigateTo: (url, options = {}) => invoke('navigateTo', { url, ...options }),
  redirectTo: (url, options = {}) => invoke('redirectTo', { url, ...options }),
  navigateBack: (options = {}) => invoke('navigateBack', { delta: 1, ...options }),
  reLaunch: (url) => invoke('reLaunch', { url }),
  previewImage: (url) => invoke('previewImage', { current: url, urls: [url] }),
  getImageInfo: (src) => invoke('getImageInfo', { src }),
  canvasToTempFilePath: (options = {}) => invoke('canvasToTempFilePath', options),
  getSetting: () => invoke('getSetting'),
  openSetting: () => invoke('openSetting'),
  showModal: (options) => invoke('showModal', options),
  showActionSheet: (itemList) => invoke('showActionSheet', { itemList }),
  showShareMenu: (options = {}) => invoke('showShareMenu', { withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'], ...options }),
  setNavigationBarColor: (options = {}) => invoke('setNavigationBarColor', options),
  saveImageToAlbum: (filePath) => invoke('saveImageToPhotosAlbum', { filePath }),
  saveVideoToAlbum: (filePath) => invoke('saveVideoToPhotosAlbum', { filePath }),
  shareImage: (path) => invoke('showShareImageMenu', { path }),
  shareVideo: (path) => invoke('showShareVideoMenu', { path }),
  canShareImage: () => typeof host.showShareImageMenu === 'function',
  canShareVideo: () => typeof host.showShareVideoMenu === 'function',
  downloadFile: async (url, options = {}) => {
    if (!isRemotePath(url)) {
      throw Object.assign(new Error('下载资源地址无效，请重新生成后重试。'), { code: 'INVALID_DOWNLOAD_URL' });
    }
    const result = await new Promise((resolve, reject) => {
      if (typeof host.downloadFile !== 'function') {
        reject(Object.assign(new Error('当前版本暂不支持文件下载'), { code: 'NOT_SUPPORTED' }));
        return;
      }
      const task = host.downloadFile({ url, timeout: 60000, success: resolve, fail: reject });
      if (typeof options.onProgressUpdate === 'function' && task && typeof task.onProgressUpdate === 'function') {
        task.onProgressUpdate(options.onProgressUpdate);
      }
    });
    if (result.statusCode !== 200) throw new Error('媒体下载失败，请重试');
    let extension = String(options.extension || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (extension && typeof host.getImageInfo === 'function') {
      try {
        const info = await invoke('getImageInfo', { src: result.tempFilePath });
        const detectedExtension = String(info.type || '').toLowerCase();
        if (['gif', 'png', 'jpg', 'jpeg', 'webp'].includes(detectedExtension)) extension = detectedExtension;
      } catch {
        // 某些端无法识别 GIF 的临时文件，继续使用页面给出的预期扩展名。
      }
    }
    const userDataPath = host.env?.USER_DATA_PATH;
    const fileManager = host.getFileSystemManager?.();
    if (!extension || !userDataPath || !fileManager?.copyFile) return result.tempFilePath;
    const target = `${userDataPath}/yanmiao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    await new Promise((resolve, reject) => fileManager.copyFile({
      srcPath: result.tempFilePath,
      destPath: target,
      success: resolve,
      fail: reject
    }));
    return target;
  },
  getFileSize: (path) => new Promise((resolve, reject) => host.getFileSystemManager().stat({ path, success: r => resolve(r.stats.size), fail: reject })),
  createSelectorQuery: () => host.createSelectorQuery(),
  createVideoContext: (id) => typeof host.createVideoContext === 'function' ? host.createVideoContext(id) : null,
  createInnerAudioContext: () => typeof host.createInnerAudioContext === 'function' ? host.createInnerAudioContext() : null,
  getSystemInfoSync: () => host.getSystemInfoSync(),
  isCancel: (error) => /cancel/i.test(error && (error.errMsg || error.message) || '')
});
