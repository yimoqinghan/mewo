const storage = require('../../../utils/storage');
const api = require('../../../services/api');
const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');
const { decorateCat } = require('../../../utils/cat-profile');
const { getActiveCats } = require('../../../utils/cat-archive');
const { isRemotePath } = require('../../../utils/media-source');

const CARD_WIDTH = 750;
const CARD_HEIGHT = 1000;

function cropDrawRect(info, width, height) {
  const sourceWidth = Number(info?.width) || width;
  const sourceHeight = Number(info?.height) || height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;
  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }
  return { cropX, cropY, cropWidth, cropHeight };
}

function compactText(value, fallback, limit = 22) {
  const text = String(value || '').trim() || fallback;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

Page({
  data: {
    cat: null,
    cardPath: '',
    qrPath: '',
    qrLoading: false,
    qrError: '',
    loading: true,
    generating: false,
    saving: false,
    sharing: false,
    error: '',
    assets: {
      fallbackCat: asset('design-webp/cat-home.webp'),
      qrLogo: asset('brand-cat.png')
    }
  },

  onLoad(options) {
    this.catId = options?.id || storage.getCurrentCatId();
    adapter.showShareMenu().catch(() => {});
    this.loadCat();
  },

  async loadCat() {
    let cats = getActiveCats(storage.getCats());
    if (api.isLoggedIn()) {
      try { cats = getActiveCats(await api.syncCats()); }
      catch (error) { if (!api.isLoginError(error)) this.setData({ error: error.message || '喵档案加载失败' }); }
    }
    const rawCat = cats.find((cat) => cat.id === this.catId) || cats[0];
    if (!rawCat) {
      this.setData({ loading: false, error: '还没有可生成的喵档案' });
      return;
    }
    const cat = decorateCat(rawCat);
    this.catId = cat.id;
    storage.setCurrentCatId(cat.id);
    this.setData({ cat, loading: false, error: '' });
    await this.prepareQrCode();
    await this.generateCard();
  },

  async prepareQrCode() {
    if (!this.data.cat || !api.isLoggedIn() || typeof api.createCatShareQr !== 'function') {
      this.setData({ qrLoading: false, qrError: '登录后可添加扫码查看入口' });
      return;
    }
    this.setData({ qrLoading: true, qrError: '' });
    try {
      const result = await api.createCatShareQr(this.data.cat.id);
      const qrPath = await adapter.writeBase64File(result.qrDataUrl, 'png');
      this.setData({ qrPath, qrLoading: false, qrError: '', shareCode: result.shareCode });
    } catch (error) {
      this.setData({ qrLoading: false, qrError: error.message || '扫码入口暂时不可用' });
    }
  },

  async resolvePhotoPath(cat) {
    const source = cat?.photos?.find((photo) => photo.isCover)?.path || cat?.photos?.[0]?.path || cat?.avatar || this.data.assets.fallbackCat;
    if (!isRemotePath(source)) return source;
    const result = await adapter.downloadFile(source, { extension: 'jpg' });
    return result.tempFilePath || source;
  },

  async resolveLogoPath() {
    const source = this.data.assets.qrLogo;
    if (!isRemotePath(source)) return source;
    const result = await adapter.downloadFile(source, { extension: 'png' });
    return result.tempFilePath || source;
  },

  drawText(context, text, x, y, size, color) {
    context.setFontSize(size);
    context.setFillStyle(color);
    context.fillText(text, x, y);
  },

  async generateCard() {
    if (!this.data.cat || this.data.generating) return;
    this.setData({ generating: true, error: '' });
    try {
      const context = adapter.createCanvasContext('cat-card-canvas', this);
      if (!context) throw new Error('当前版本暂不支持喵卡片生成');
      const photoPath = await this.resolvePhotoPath(this.data.cat);
      const photoInfo = await adapter.getImageInfo(photoPath);
      const logoPath = this.data.qrPath ? await this.resolveLogoPath() : '';
      const photoHeight = 560;
      const imageRect = cropDrawRect(photoInfo, CARD_WIDTH, photoHeight);

      context.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      context.setFillStyle('#edf4ff');
      context.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
      context.drawImage(photoPath, imageRect.cropX, imageRect.cropY, imageRect.cropWidth, imageRect.cropHeight, 0, 0, CARD_WIDTH, photoHeight);
      context.setGlobalAlpha(0.18);
      context.setFillStyle('#27305b');
      context.fillRect(0, 0, CARD_WIDTH, photoHeight);
      context.setGlobalAlpha(1);

      context.setFillStyle('#fff9fc');
      context.fillRect(0, photoHeight - 28, CARD_WIDTH, CARD_HEIGHT - photoHeight + 28);
      context.setFillStyle('#f66e9c');
      context.fillRect(48, photoHeight - 8, 92, 8);
      this.drawText(context, 'MEOW PROFILE', 48, photoHeight + 60, 20, '#8a7a9b');
      this.drawText(context, compactText(this.data.cat.name, '未命名喵', 12), 48, photoHeight + 120, 48, '#3d2a72');
      this.drawText(context, compactText(this.data.cat.humanProfile?.role, '家里的小主角', 20), 48, photoHeight + 158, 23, '#d84e80');
      this.drawText(context, `${compactText(this.data.cat.ageText, '年龄未记录', 16)}  ·  ${compactText(this.data.cat.birthday, '生日待补充', 16)}`, 48, photoHeight + 198, 21, '#69738d');

      const traits = compactText(this.data.cat.traits, '性格待补充', 28);
      const likes = compactText(Array.isArray(this.data.cat.likes) ? this.data.cat.likes.join('、') : this.data.cat.likes, '还没有记录', 24);
      const dislikes = compactText(Array.isArray(this.data.cat.dislikes) ? this.data.cat.dislikes.join('、') : this.data.cat.dislikes, '还没有记录', 24);
      this.drawText(context, '猫格', 48, photoHeight + 258, 20, '#f66e9c');
      this.drawText(context, traits, 112, photoHeight + 258, 21, '#3d2a72');
      this.drawText(context, `喜欢  ${likes}`, 48, photoHeight + 304, 20, '#69738d');
      this.drawText(context, `不喜欢  ${dislikes}`, 48, photoHeight + 342, 20, '#9a9fb0');
      this.drawText(context, `“${compactText(this.data.cat.humanProfile?.catchphrase, '今天也要可爱', 22)}”`, 48, photoHeight + 398, 25, '#3d2a72');

      if (this.data.qrPath) {
        const qrX = 520;
        const qrY = photoHeight + 84;
        const qrSize = 176;
        context.setFillStyle('#ffffff');
        context.fillRect(qrX - 14, qrY - 14, qrSize + 28, qrSize + 28);
        context.drawImage(this.data.qrPath, qrX, qrY, qrSize, qrSize);
        if (logoPath) {
          const centerX = qrX + qrSize / 2;
          const centerY = qrY + qrSize / 2;
          context.setFillStyle('#ffffff');
          context.beginPath();
          context.arc(centerX, centerY, 24, 0, Math.PI * 2);
          context.fill();
          context.drawImage(logoPath, centerX - 18, centerY - 18, 36, 36);
        }
        this.drawText(context, '扫码看完整档案', 524, photoHeight + 294, 18, '#69738d');
      }
      this.drawText(context, '言喵 · 和猫一起，把日子过得可爱一点。', 48, CARD_HEIGHT - 34, 18, '#a0a1b0');

      const cardPath = await new Promise((resolve, reject) => {
        context.draw(false, () => {
          adapter.canvasToTempFilePath({ canvasId: 'cat-card-canvas', x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, destWidth: CARD_WIDTH, destHeight: CARD_HEIGHT, fileType: 'jpg', quality: 0.94 })
            .then((result) => resolve(result.tempFilePath || ''))
            .catch(reject);
        });
      });
      if (!cardPath) throw new Error('喵卡片生成失败，请重试');
      this.setData({ cardPath, generating: false });
    } catch (error) {
      this.setData({ generating: false, error: error.message || '喵卡片生成失败，请重试' });
    }
  },

  preview() {
    if (this.data.cardPath) adapter.previewImage(this.data.cardPath).catch(() => {});
  },

  async download() {
    if (!this.data.cardPath || this.data.saving) return;
    this.setData({ saving: true });
    try {
      await adapter.saveImageToAlbum(this.data.cardPath);
      adapter.showToast('喵卡片已保存', 'success');
    } catch (error) {
      if (!adapter.isCancel(error) && /auth|permission|denied/i.test(error.errMsg || error.message || '')) {
        const setting = await adapter.showModal({ title: '需要相册权限', content: '允许言喵把喵卡片保存到相册吗？', confirmText: '去设置', cancelText: '暂不' }).catch(() => null);
        if (setting?.confirm) await adapter.openSetting().catch(() => {});
      } else if (!adapter.isCancel(error)) adapter.showToast(error.message || '保存失败，请重试');
    } finally { this.setData({ saving: false }); }
  },

  async share() {
    if (!this.data.cardPath || this.data.sharing) return;
    if (!adapter.canShareImage()) return adapter.showToast('当前微信版本暂不支持图片分享，请先保存到相册');
    this.setData({ sharing: true });
    try {
      await adapter.shareImage(this.data.cardPath);
      adapter.showToast('已打开分享菜单');
    } catch (error) {
      if (!adapter.isCancel(error)) adapter.showToast(error.message || '分享失败，请重试');
    } finally { this.setData({ sharing: false }); }
  },

  back() { adapter.navigateBack().catch(() => adapter.navigateTo('/pages/cats/cats')); }
});
