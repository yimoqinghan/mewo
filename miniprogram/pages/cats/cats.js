const storage = require('../../utils/storage');
const api = require('../../services/api');
const adapter = require('../../utils/adapter');
const { decorateCat } = require('../../utils/cat-profile');
const { getActiveCats, getPreferredCurrentCatId } = require('../../utils/cat-archive');

Page({
  data: {
    cats: [],
    currentCatId: ''
  },

  async onShow() {
    await this.loadCats();
  },

  async loadCats() {
    let cats = getActiveCats(storage.getCats());
    if (api.isLoggedIn()) {
      try { cats = await api.syncCats(); }
      catch (error) {
        if (!api.isLoginError(error)) adapter.showToast(error.message || '猫咪档案加载失败');
      }
    }
    const activeCats = getActiveCats(cats);
    const currentCatId = getPreferredCurrentCatId(activeCats, storage.getCurrentCatId());
    if (currentCatId) storage.setCurrentCatId(currentCatId);
    this.setData({
      cats: activeCats.map(decorateCat),
      currentCatId
    });
  },

  selectCat(event) {
    const catId = event.currentTarget.dataset.id;
    storage.setCurrentCatId(catId);
    const app = getApp();
    app.globalData.currentCatId = catId;
    this.setData({ currentCatId: catId });
    if (api.isLoggedIn() && api.setDefaultCat) api.setDefaultCat(catId).catch(() => {});
    adapter.showToast('已切换当前主角');
  },

  addCat() {
    adapter.navigateTo('/pages/cat-edit/cat-edit');
  },

  editCat(event) {
    const catId = event.currentTarget.dataset.id;
    adapter.navigateTo(`/pages/cat-edit/cat-edit?id=${catId}`);
  },

  viewCat(event) {
    const catId = event.currentTarget.dataset.id;
    adapter.navigateTo(`/pages/cat-profile/cat-profile?id=${catId}`);
  },

  manageCat(event) {
    const catId = event.currentTarget.dataset.id;
    const cat = this.data.cats.find((item) => item.id === catId);
    if (!cat) return;
    adapter.showActionSheet(['编辑档案', '设为当前主角', '归档这只喵']).then((result) => {
      if (result.tapIndex === 0) return this.editCat(event);
      if (result.tapIndex === 1) return this.selectCat(event);
      if (result.tapIndex === 2) return this.archiveCat(cat);
    }).catch((error) => {
      if (!adapter.isCancel(error)) adapter.showToast(error.message || '操作失败，请稍后重试');
    });
  },

  async archiveCat(cat) {
    const result = await adapter.showModal({
      title: `归档${cat.name}？`,
      content: '归档后不会出现在当前猫咪列表里，已生成的作品不会被删除。',
      confirmText: '归档',
      cancelText: '再想想'
    }).catch(() => null);
    if (!result?.confirm) return;
    try {
      if (api.isLoggedIn() && api.archiveCat) {
        await api.archiveCat(cat.id);
      } else {
        const cats = storage.getCats().map((item) => item.id === cat.id ? { ...item, archived: true, archivedAt: new Date().toISOString() } : item);
        storage.saveCats(cats);
      }
      if (storage.getCurrentCatId() === cat.id) storage.setCurrentCatId('');
      await this.loadCats();
      adapter.showToast('已归档这只喵');
    } catch (error) {
      adapter.showToast(error.message || '归档失败，请稍后重试');
    }
  }
});
