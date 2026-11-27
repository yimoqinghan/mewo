const api = require('../../../services/api');
const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');

Page({
  data: { loading: true, work: null, error: '', saving: false, sharing: false, assets: { cloudSoft: asset('design-webp/cloud-soft.webp') } },
  async onLoad(options) {
    adapter.showShareMenu().catch(() => {});
    this.workId = options.id || '';
    if (!this.workId) return this.setData({ loading: false, error: '找不到这张贴纸' });
    await this.loadWork();
  },
  onShareAppMessage() {
    return {
      title: this.data.work?.title || '我的喵咪创意作品',
      path: `/subpackages/creation/sticker-result/sticker-result?id=${encodeURIComponent(this.workId || '')}`,
      imageUrl: this.data.work?.cover?.url || ''
    };
  },
  onShareTimeline() {
    return {
      title: this.data.work?.title || '我的喵咪创意作品',
      query: `id=${encodeURIComponent(this.workId || '')}`,
      imageUrl: this.data.work?.cover?.url || ''
    };
  },
  async loadWork() {
    try {
      const data = await api.getWork(this.workId);
      if (!data.work?.cover?.url) throw new Error('贴纸图片暂时无法读取，请稍后重试');
      this.setData({ loading: false, work: data.work, error: '' });
    } catch (error) { this.setData({ loading: false, error: error.message || '贴纸加载失败' }); }
  },
  async saveWork() {
    if (!this.data.work || this.data.saving) return;
    this.setData({ saving: true });
    try { await api.saveWork(this.workId); this.setData({ 'work.saved': true }); adapter.showToast('已保存到喵作', 'success'); }
    catch (error) { adapter.showToast(error.message || '保存失败，请重试'); }
    finally { this.setData({ saving: false }); }
  },
  async download() {
    if (!this.data.work || this.data.saving) return;
    this.setData({ saving: true });
    try { const path = await adapter.downloadFile(this.data.work.cover.url); await adapter.saveImageToAlbum(path); adapter.showToast('已保存到相册', 'success'); }
    catch (error) {
      if (!adapter.isCancel(error) && /auth|permission|denied/i.test(error.errMsg || error.message || '')) {
        const setting = await adapter.showModal({ title: '需要相册权限', content: '允许言喵把贴纸保存到相册吗？', confirmText: '去设置', cancelText: '暂不' }).catch(() => null);
        if (setting?.confirm) await adapter.openSetting().catch(() => {});
      } else if (!adapter.isCancel(error)) adapter.showToast(error.message || '下载失败，请重试');
    } finally { this.setData({ saving: false }); }
  },
  async share() {
    if (!this.data.work || this.data.sharing) return;
    if (!adapter.canShareImage()) return adapter.showToast('当前微信版本暂不支持图片分享');
    this.setData({ sharing: true });
    try { const path = await adapter.downloadFile(this.data.work.cover.url); await adapter.shareImage(path); adapter.showToast('已打开分享菜单'); }
    catch (error) { if (!adapter.isCancel(error)) adapter.showToast(error.message || '分享失败，请重试'); }
    finally { this.setData({ sharing: false }); }
  },
  preview() { if (this.data.work?.cover) adapter.previewImage(this.data.work.cover.url).catch(() => {}); },
  retry() { this.setData({ loading: true, error: '' }); this.loadWork(); },
  back() { adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index')); }
});
