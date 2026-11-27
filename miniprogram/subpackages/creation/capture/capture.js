const storage = require('../../../utils/storage');
const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');

const FILTERS = [
  { id: 'natural', name: '原色', icon: asset('capture-icons/filter-natural.webp') },
  { id: 'soft', name: '柔光', icon: asset('capture-icons/filter-soft.webp') },
  { id: 'warm', name: '奶油', icon: asset('capture-icons/filter-warm.webp') },
  { id: 'cool', name: '清透', icon: asset('capture-icons/filter-cool.webp') },
  { id: 'film', name: '电影', icon: asset('capture-icons/filter-film.webp') }
];

const BEAUTY_TOOLS = [
  { id: 'natural', name: '自然', minLabel: '轻柔', maxLabel: '明亮', icon: asset('capture-icons/beauty-natural.webp') },
  { id: 'light', name: '补光', minLabel: '柔和', maxLabel: '通透', icon: asset('capture-icons/beauty-light.webp') },
  { id: 'clarity', name: '清晰', minLabel: '细腻', maxLabel: '锐利', icon: asset('capture-icons/beauty-clarity.webp') },
  { id: 'color', name: '色彩', minLabel: '淡雅', maxLabel: '鲜活', icon: asset('capture-icons/beauty-color.webp') }
];

const CAMERA_TEMPLATES = [
  { id: 'cream-cat', name: '奶油喵', desc: '柔光显毛色', icon: asset('capture-templates/cream-cat.webp'), filter: 'warm', resource: asset('capture-templates/cream-cat.json'), beautyValues: { natural: 52, light: 42, clarity: 18, color: 34 } },
  { id: 'sunny-cat', name: '阳光喵', desc: '明亮又通透', icon: asset('capture-templates/sunny-cat.webp'), filter: 'soft', resource: asset('capture-templates/sunny-cat.json'), beautyValues: { natural: 40, light: 68, clarity: 30, color: 24 } },
  { id: 'cinema-cat', name: '电影喵', desc: '一秒有氛围', icon: asset('capture-templates/cinema-cat.webp'), filter: 'film', resource: asset('capture-templates/cinema-cat.json'), beautyValues: { natural: 26, light: 16, clarity: 64, color: 18 } },
  { id: 'candy-cat', name: '糖果喵', desc: '粉彩小可爱', icon: asset('capture-templates/candy-cat.webp'), filter: 'cool', resource: asset('capture-templates/candy-cat.json'), beautyValues: { natural: 45, light: 32, clarity: 22, color: 72 } },
  { id: 'forest-cat', name: '森林喵', desc: '清新自然感', icon: asset('capture-templates/forest-cat.webp'), filter: 'natural', resource: asset('capture-templates/forest-cat.json'), beautyValues: { natural: 58, light: 36, clarity: 34, color: 42 } },
  { id: 'blossom-cat', name: '樱花喵', desc: '温柔粉色调', icon: asset('capture-templates/blossom-cat.webp'), filter: 'soft', resource: asset('capture-templates/blossom-cat.json'), beautyValues: { natural: 48, light: 54, clarity: 20, color: 58 } },
  { id: 'ocean-cat', name: '海盐喵', desc: '清透蓝调感', icon: asset('capture-templates/ocean-cat.webp'), filter: 'cool', resource: asset('capture-templates/ocean-cat.json'), beautyValues: { natural: 34, light: 50, clarity: 56, color: 36 } },
  { id: 'moonlight-cat', name: '月光喵', desc: '梦幻夜色感', icon: asset('capture-templates/moonlight-cat.webp'), filter: 'film', resource: asset('capture-templates/moonlight-cat.json'), beautyValues: { natural: 24, light: 22, clarity: 48, color: 46 } },
  { id: 'bubble-party', name: '泡泡派对', desc: '泡泡和爱心环绕', icon: asset('capture-overlays/bubble-party-v2.webp'), filter: 'soft', resource: asset('capture-templates/bubble-party.json'), beautyValues: { natural: 44, light: 58, clarity: 20, color: 62 }, overlay: { src: asset('capture-overlays/bubble-party-v2.webp') } },
  { id: 'rainbow-bow', name: '彩虹蝴蝶结', desc: '甜甜的彩虹边框', icon: asset('capture-overlays/rainbow-bow-v2.webp'), filter: 'soft', resource: asset('capture-templates/rainbow-bow.json'), beautyValues: { natural: 50, light: 64, clarity: 18, color: 70 }, overlay: { src: asset('capture-overlays/rainbow-bow-v2.webp') } },
  { id: 'moon-magic', name: '星月魔法', desc: '月亮星球的夜光感', icon: asset('capture-overlays/moon-magic-v2.webp'), filter: 'film', resource: asset('capture-templates/moon-magic.json'), beautyValues: { natural: 28, light: 30, clarity: 46, color: 50 }, overlay: { src: asset('capture-overlays/moon-magic-v2.webp') } },
  { id: 'crown-star', name: '皇冠出道', desc: '今天也要闪闪出道', icon: asset('capture-overlays/crown-star-v2.webp'), filter: 'warm', resource: asset('capture-templates/crown-star.json'), beautyValues: { natural: 46, light: 52, clarity: 34, color: 58 }, overlay: { src: asset('capture-overlays/crown-star-v2.webp') } }
];

// 与 capture.wxss 的相机视口保持同一套尺寸，避免原生 camera 与拍后图片使用不同裁剪比例。
const CAMERA_VIEWPORT_WIDTH_RPX = 702;
const CAMERA_VIEWPORT_HEIGHT_RPX = 936;
const CAMERA_VIEWPORT_HEIGHT_SMALL_RPX = 700;

function getCameraViewport() {
  let info = {};
  try {
    info = adapter.getSystemInfoSync() || {};
  } catch (error) {
    info = {};
  }
  const windowWidth = Number(info.windowWidth) || 375;
  const windowHeight = Number(info.windowHeight) || 812;
  const heightRpx = windowHeight <= 740 ? CAMERA_VIEWPORT_HEIGHT_SMALL_RPX : CAMERA_VIEWPORT_HEIGHT_RPX;
  const rpxScale = windowWidth / 750;
  return {
    width: Math.max(1, Math.round(CAMERA_VIEWPORT_WIDTH_RPX * rpxScale)),
    height: Math.max(1, Math.round(heightRpx * rpxScale))
  };
}

function getOverlayFrameStyle() {
  const smallScreen = (() => {
    try {
      return Number((adapter.getSystemInfoSync() || {}).windowHeight) <= 740;
    } catch (error) {
      return false;
    }
  })();
  const viewportWidth = CAMERA_VIEWPORT_WIDTH_RPX;
  const viewportHeight = smallScreen ? CAMERA_VIEWPORT_HEIGHT_SMALL_RPX : CAMERA_VIEWPORT_HEIGHT_RPX;
  const overlayRatio = 3 / 4;
  const width = Math.min(viewportWidth, Math.round(viewportHeight * overlayRatio));
  const height = Math.min(viewportHeight, Math.round(viewportWidth / overlayRatio));
  return `top:${Math.round((viewportHeight - height) / 2)}rpx;left:${Math.round((viewportWidth - width) / 2)}rpx;width:${width}rpx;height:${height}rpx;`;
}

Page({
  data: {
    assets: {
      controlStrip: asset('capture-icons/control-strip.webp'),
      close: asset('capture-icons/close.webp')
    },
    filters: FILTERS,
    beautyTools: BEAUTY_TOOLS,
    templates: CAMERA_TEMPLATES,
    templateDownloading: '',
    templateProgress: 0,
    templateProgressStyle: '',
    activeTemplate: '',
    downloadedTemplateCount: 0,
    selectedFilter: 'natural',
    activeTemplateOverlay: null,
    overlayFrameStyle: '',
    beautyEnabled: true,
    activeBeautyTool: 'natural',
    activeBeautyToolName: '自然',
    activeBeautyMinLabel: '轻柔',
    activeBeautyMaxLabel: '明亮',
    activeBeautyValue: 36,
    activeBeautyIcon: asset('capture-icons/beauty-natural.webp'),
    settingsTab: 'beauty',
    beautyValues: { natural: 36, light: 28, clarity: 24, color: 30 },
    devicePosition: 'back',
    flash: 'off',
    cameraReady: false,
    previewMode: false,
    showSettings: false,
    processing: false,
    photoPath: '',
    error: ''
  },

  onLoad(options) {
    this.pageAlive = true;
    this.target = options?.target || 'create';
    this.cameraViewport = getCameraViewport();
    this.setData({ overlayFrameStyle: getOverlayFrameStyle() });
    this.loadTemplates();
    adapter.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#111827' }).catch(() => {});
  },

  onReady() {
    this.cameraContext = adapter.createCameraContext('capture-camera');
  },

  onShow() { this.pageAlive = true; },

  onHide() { this.pageAlive = false; },

  onUnload() {
    this.pageAlive = false;
    adapter.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#f8f7fb' }).catch(() => {});
  },

  onCameraReady() {
    this.setData({ cameraReady: true, error: '' });
  },

  onCameraError(event) {
    this.setData({ cameraReady: false, error: event?.detail?.errMsg || '相机暂时不可用，请检查相机权限。' });
  },

  loadTemplates() {
    const downloaded = storage.getCameraTemplates();
    const templates = CAMERA_TEMPLATES.map((item) => ({ ...item, downloaded: Boolean(downloaded[item.id]) }));
    this.setData({ templates, downloadedTemplateCount: templates.filter((item) => item.downloaded).length });
  },

  updateTemplateIconState(event, loaded) {
    const id = event.currentTarget.dataset.template;
    if (!id) return;
    const templates = this.data.templates.map((item) => item.id === id ? { ...item, iconLoaded: loaded } : item);
    this.setData({ templates });
  },

  onTemplateIconLoad(event) { this.updateTemplateIconState(event, true); },
  onTemplateIconError(event) { this.updateTemplateIconState(event, false); },

  updateTemplateProgress(progress) {
    const value = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
    this.setData({ templateProgress: value, templateProgressStyle: `background:conic-gradient(#F66E9C ${value}%, rgba(255,255,255,.24) 0);` });
  },

  applyTemplate(template) {
    const beautyValues = { ...this.data.beautyValues, ...(template.beautyValues || {}) };
    const activeTool = this.data.beautyTools.find((item) => item.id === this.data.activeBeautyTool) || this.data.beautyTools[0];
    this.setData({ selectedFilter: template.filter || 'natural', beautyValues, activeTemplate: template.id || '', activeTemplateOverlay: template.overlay || null, activeBeautyValue: beautyValues[activeTool.id] || 0, error: '' });
    adapter.showToast(`${template.name || '模板'}已应用`);
  },

  async useTemplate(event) {
    if (this.data.processing || this.data.templateDownloading) return;
    const template = this.data.templates.find((item) => item.id === event.currentTarget.dataset.template);
    if (!template) return;
    if (template.downloaded) return this.applyTemplate(template);
    this.setData({ templateDownloading: template.id, templateProgress: 0, templateProgressStyle: 'background:conic-gradient(#F66E9C 0%, rgba(255,255,255,.24) 0);', error: '' });
    try {
      const localPath = await adapter.downloadFile(template.resource, { extension: 'json', onProgressUpdate: (event) => this.updateTemplateProgress((Number(event?.progress) || 0) * 0.5) });
      const payload = JSON.parse(await adapter.readFileAsText(localPath));
      if (payload.overlay?.src) {
        const overlayResult = await adapter.downloadFile(payload.overlay.src, { extension: 'webp', onProgressUpdate: (event) => this.updateTemplateProgress(50 + (Number(event?.progress) || 0) * 0.5) });
        if (overlayResult?.tempFilePath) payload.overlay = { ...payload.overlay, src: overlayResult.tempFilePath };
      }
      const downloaded = { ...storage.getCameraTemplates(), [template.id]: true };
      storage.saveCameraTemplates(downloaded);
      this.updateTemplateProgress(100);
      this.setData({ templates: this.data.templates.map((item) => item.id === template.id ? { ...item, ...payload, downloaded: true } : item), downloadedTemplateCount: this.data.downloadedTemplateCount + 1 });
      this.applyTemplate({ ...template, ...payload });
    } catch (error) {
      if (!adapter.isCancel(error)) {
        this.setData({ error: '模板下载较慢，先使用内置效果，网络恢复后可再次下载。' });
        this.applyTemplate(template);
      }
    } finally {
      this.setData({ templateDownloading: '', templateProgress: 0, templateProgressStyle: '' });
    }
  },

  handleBack() {
    if (this.data.previewMode) return this.retakePhoto();
    return adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index'));
  },

  toggleSettings() {
    if (this.data.processing) return;
    const showSettings = !this.data.showSettings;
    this.setData({ showSettings, cameraReady: showSettings ? false : this.data.cameraReady }, () => {
      if (!showSettings) this.cameraContext = adapter.createCameraContext('capture-camera');
    });
  },

  closeSettings() {
    this.setData({ showSettings: false, cameraReady: false }, () => {
      this.cameraContext = adapter.createCameraContext('capture-camera');
    });
  },
  stopTap() {},

  selectSettingsTab(event) {
    if (this.data.processing) return;
    this.setData({ settingsTab: event.currentTarget.dataset.tab || 'beauty' });
  },

  toggleCamera() {
    this.setData({ devicePosition: this.data.devicePosition === 'back' ? 'front' : 'back', cameraReady: false });
  },

  toggleFlash() {
    const enabled = this.data.flash !== 'on';
    this.setData({ flash: enabled ? 'on' : 'off' });
  },

  toggleBeauty(event) {
    this.setData({ beautyEnabled: Boolean(event.detail.value) });
  },

  updateBeautyIconState(event, loaded) {
    const id = event.currentTarget.dataset.tool;
    if (!id) return;
    const beautyTools = this.data.beautyTools.map((item) => item.id === id ? { ...item, iconLoaded: loaded } : item);
    this.setData({ beautyTools });
  },

  onBeautyIconLoad(event) { this.updateBeautyIconState(event, true); },
  onBeautyIconError(event) { this.updateBeautyIconState(event, false); },

  selectBeautyTool(event) {
    if (this.data.processing) return;
    const id = event.currentTarget.dataset.tool || 'natural';
    const tool = this.data.beautyTools.find((item) => item.id === id) || this.data.beautyTools[0];
    this.setData({ activeBeautyTool: tool.id, activeBeautyToolName: tool.name, activeBeautyMinLabel: tool.minLabel, activeBeautyMaxLabel: tool.maxLabel, activeBeautyValue: this.data.beautyValues[tool.id] || 0, activeBeautyIcon: tool.icon });
  },

  onBeautyChanging(event) {
    const value = Math.max(0, Math.min(100, Number(event.detail.value) || 0));
    this.setData({ activeBeautyValue: value, [`beautyValues.${this.data.activeBeautyTool}`]: value });
  },

  selectFilter(event) {
    if (this.data.processing) return;
    this.setData({ selectedFilter: event.currentTarget.dataset.filter || 'natural' });
  },

  capturePhoto() {
    if (!this.cameraContext || !this.data.cameraReady || this.data.processing) return;
    this.cameraContext.takePhoto({
      quality: 'high',
      success: (result) => this.preparePhoto(result?.tempImagePath, { mirror: this.data.devicePosition === 'front' }),
      fail: () => this.setData({ error: '拍摄失败，请保持镜头稳定后重试。' })
    });
  },

  async chooseAlbum() {
    if (this.data.processing) return;
    try {
      const path = await adapter.chooseImage(['album']);
      await this.preparePhoto(path);
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ error: '读取照片失败，请检查相册权限后重试。' });
    }
  },

  async preparePhoto(path, options = {}) {
    if (!path || !this.pageAlive) return;
    this.setData({ photoPath: path, previewMode: true, processing: true, error: '' });
    let processedPath = path;
    try {
      // 即使选择原色，也先按取景框比例裁剪，确保拍摄时看到的构图与拍后保持一致。
      processedPath = await this.applyPhotoEffect(path, { mirror: Boolean(options.mirror) });
    } catch (error) {
      // 原图仍可继续生成，不让轻量美化阻断主创作闭环。
      this.setData({ error: '美化处理未完成，已保留原图，可以继续创作。' });
    }
    if (this.pageAlive) this.setData({ photoPath: processedPath || path, processing: false });
  },

  applyPhotoEffect(path, options = {}) {
    const context = adapter.createCanvasContext('capture-canvas', this);
    if (!context) return Promise.resolve(path);
    return adapter.getImageInfo(path).then(async (info) => {
      const sourceWidth = Number(info.width) || 1080;
      const sourceHeight = Number(info.height) || 1440;
      const overlayPath = await this.resolveTemplateOverlayPath();
      let overlayInfo = null;
      if (overlayPath) {
        try {
          overlayInfo = await adapter.getImageInfo(overlayPath);
        } catch (error) {
          overlayInfo = null;
        }
      }
      const viewport = this.cameraViewport || getCameraViewport();
      const viewportRatio = viewport.width / viewport.height;
      const sourceRatio = sourceWidth / sourceHeight;
      let cropWidth = sourceWidth;
      let cropHeight = sourceHeight;
      let cropX = 0;
      let cropY = 0;
      if (sourceRatio > viewportRatio) {
        cropWidth = sourceHeight * viewportRatio;
        cropX = (sourceWidth - cropWidth) / 2;
      } else if (sourceRatio < viewportRatio) {
        cropHeight = sourceWidth / viewportRatio;
        cropY = (sourceHeight - cropHeight) / 2;
      }
      const outputScale = Math.min(1, 1600 / Math.max(cropWidth, cropHeight));
      const width = Math.max(1, Math.round(cropWidth * outputScale));
      const height = Math.max(1, Math.round(cropHeight * outputScale));
      const values = this.data.beautyEnabled ? this.data.beautyValues : {};
      const natural = Number(values.natural || 0) / 100;
      const light = Number(values.light || 0) / 100;
      const clarity = Number(values.clarity || 0) / 100;
      const color = Number(values.color || 0) / 100;
      context.clearRect(0, 0, width, height);
      if (options.mirror) {
        context.save();
        context.translate(width, 0);
        context.scale(-1, 1);
        context.drawImage(path, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
        context.restore();
      } else {
        context.drawImage(path, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
      }
      if (natural > 0) {
        context.setGlobalAlpha(0.03 + natural * 0.08);
        context.setFillStyle('#fff8ef');
        context.fillRect(0, 0, width, height);
      }
      if (light > 0) {
        context.setGlobalAlpha(light * 0.12);
        context.setFillStyle('#fffdf8');
        context.fillRect(0, 0, width, height);
      }
      if (clarity > 0) {
        context.setGlobalAlpha(clarity * 0.035);
        context.setFillStyle('#172238');
        context.fillRect(0, 0, width, height);
      }
      if (color > 0) {
        context.setGlobalAlpha(color * 0.1);
        context.setFillStyle('#ffd9c2');
        context.fillRect(0, 0, width, height);
      }
      const tint = { warm: '#ffd7a8', cool: '#cfe3ff', film: '#28314a' }[this.data.selectedFilter];
      if (tint) {
        context.setGlobalAlpha(this.data.selectedFilter === 'film' ? 0.08 : 0.1);
        context.setFillStyle(tint);
        context.fillRect(0, 0, width, height);
      }
      if (overlayPath) {
        const overlayWidth = Number(overlayInfo?.width) || width;
        const overlayHeight = Number(overlayInfo?.height) || height;
        const overlayScale = Math.min(width / overlayWidth, height / overlayHeight);
        const drawWidth = overlayWidth * overlayScale;
        const drawHeight = overlayHeight * overlayScale;
        context.drawImage(overlayPath, 0, 0, overlayWidth, overlayHeight, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      }
      context.setGlobalAlpha(1);
      return new Promise((resolve, reject) => {
        context.draw(false, () => {
          adapter.canvasToTempFilePath({ canvasId: 'capture-canvas', x: 0, y: 0, width, height, destWidth: width, destHeight: height, fileType: 'jpg', quality: 0.92 })
            .then((result) => resolve(result.tempFilePath || path))
            .catch(reject);
        });
      });
    });
  },

  resolveTemplateOverlayPath() {
    const overlay = this.data.activeTemplateOverlay;
    if (!overlay?.src) return Promise.resolve('');
    if (!/^https?:\/\//i.test(overlay.src)) return Promise.resolve(overlay.src);
    this.templateOverlayCache = this.templateOverlayCache || {};
    if (this.templateOverlayCache[overlay.src]) return Promise.resolve(this.templateOverlayCache[overlay.src]);
    return adapter.downloadFile(overlay.src, { extension: 'webp' })
      .then((result) => {
        const path = result?.tempFilePath || '';
        if (path) this.templateOverlayCache[overlay.src] = path;
        return path;
      })
      .catch(() => '');
  },

  retakePhoto() {
    if (this.data.processing) return;
    this.setData({ photoPath: '', previewMode: false, cameraReady: false, error: '' });
  },

  confirmPhoto() {
    if (!this.data.photoPath || this.data.processing) return;
    storage.setPhotoDraft(this.data.photoPath);
    try { storage.claimWelfareTask('create', '开启一次创作', 30); } catch (rewardError) { /* 喵币记录失败不影响创作 */ }
    adapter.redirectTo('/subpackages/creation/create/create').catch(() => adapter.navigateTo('/subpackages/creation/create/create'));
  }
});
