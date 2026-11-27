const storage = require('../../utils/storage');
const api = require('../../services/api');
const adapter = require('../../utils/adapter');
const { decorateCat, avatarUrl } = require('../../utils/cat-profile');
const { getActiveCats } = require('../../utils/cat-archive');

Page({
  data: { cat: null, photos: [], ageText: '', traitList: [], likesText: '', dislikesText: '', profileReady: false, isPublicShare: false, error: '' },

  onLoad(options) {
    let scene = '';
    try { scene = options?.scene ? decodeURIComponent(options.scene) : ''; } catch { scene = options?.scene || ''; }
    this.shareCode = String(options?.shareCode || scene || '').trim();
    this.catId = options?.id || storage.getCurrentCatId();
    this.setData({ isPublicShare: Boolean(this.shareCode) });
  },

  async onShow() {
    if (this.shareCode) {
      try {
        const result = await api.getPublicCatShare(this.shareCode);
        const shared = result.cat || {};
        const cat = decorateCat({
          ...shared,
          humanRole: shared.persona?.pastLifeRole || '',
          speechStyle: shared.persona?.speechStyle || '',
          catchphrase: shared.persona?.catchphrase || ''
        });
        const publicPhoto = { id: 'shared-avatar', path: avatarUrl(cat), isCover: true };
        this.setData({ cat, photos: cat.photos.length ? cat.photos : [publicPhoto], ageText: cat.ageText, traitList: String(cat.traits || '').split(' · ').filter(Boolean), likesText: cat.likes?.length ? cat.likes.join('、') : '还没有记录', dislikesText: cat.dislikes?.length ? cat.dislikes.join('、') : '还没有记录', profileReady: true, error: '' });
      } catch (error) {
        this.setData({ profileReady: false, error: error.message || '喵档案分享已失效' });
        adapter.showToast(error.message || '喵档案分享已失效');
      }
      return;
    }
    let cats = getActiveCats(storage.getCats());
    if (api.isLoggedIn()) {
      try { cats = getActiveCats(await api.syncCats()); } catch (error) { if (!api.isLoginError(error)) adapter.showToast(error.message || '喵档案加载失败'); }
    }
    const rawCat = cats.find((cat) => cat.id === this.catId) || cats[0];
    if (!rawCat) return adapter.navigateTo('/pages/cat-edit/cat-edit');
    const cat = decorateCat(rawCat);
    storage.setCurrentCatId(cat.id);
    this.setData({ cat, photos: cat.photos.length ? cat.photos : [{ id: 'avatar', path: avatarUrl(cat), isCover: true }], ageText: cat.ageText, traitList: String(cat.traits || '').split(' · ').filter(Boolean), likesText: cat.likes?.length ? cat.likes.join('、') : '还没有记录', dislikesText: cat.dislikes?.length ? cat.dislikes.join('、') : '还没有记录', profileReady: true, error: '' });
  },

  edit() { if (this.data.cat) adapter.navigateTo(`/pages/cat-edit/cat-edit?id=${this.data.cat.id}`); },

  createCard() { if (this.data.cat) adapter.navigateTo(`/subpackages/companion/cat-card/cat-card?id=${encodeURIComponent(this.data.cat.id)}`); },

  previewPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const urls = this.data.photos.map((photo) => photo.path);
    adapter.previewImage(urls[index] || urls[0]).catch(() => {});
  },

  back() { adapter.navigateBack().catch(() => adapter.navigateTo('/pages/cats/cats')); }
});
