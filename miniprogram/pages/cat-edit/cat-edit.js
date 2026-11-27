const storage = require('../../utils/storage');
const api = require('../../services/api');
const adapter = require('../../utils/adapter');
const { asset } = require('../../utils/assets');
const { calculateAge, decorateCat, splitTags } = require('../../utils/cat-profile');
const { createLocalCat, getActiveCats } = require('../../utils/cat-archive');

Page({
  data: {
    editingId: '',
    assets: { brandCat: asset('brand-cat.png') },
    photos: [],
    form: {
      name: '',
      age: '',
      birthday: '',
      traits: '',
      personality: '',
      likes: '',
      dislikes: '',
      humanRole: '',
      speechStyle: '',
      catchphrase: ''
    }
  },

  async onLoad(options) {
    if (!options?.id) return;
    let cats = getActiveCats(storage.getCats());
    if (api.isLoggedIn()) {
      try { cats = getActiveCats(await api.syncCats()); } catch (error) { if (!api.isLoginError(error)) adapter.showToast(error.message || '猫咪档案加载失败'); }
    }
    const cat = cats.find((item) => item.id === options.id);
    if (cat) {
      const decorated = decorateCat(cat);
      this.setData({
        editingId: cat.id,
        photos: decorated.photos,
        form: {
          name: cat.name || '',
          age: cat.age || '',
          birthday: cat.birthday || '',
          traits: Array.isArray(cat.traits) ? cat.traits.join('、') : (cat.traits || ''),
          personality: cat.personality || '',
          likes: Array.isArray(cat.likes) ? cat.likes.join('、') : (cat.likes || ''),
          dislikes: Array.isArray(cat.dislikes) ? cat.dislikes.join('、') : (cat.dislikes || ''),
          humanRole: cat.humanRole || decorated.humanProfile.role || '',
          speechStyle: cat.speechStyle || decorated.humanProfile.speechStyle || '',
          catchphrase: cat.catchphrase || decorated.humanProfile.catchphrase || ''
        }
      });
    }
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },

  onBirthdayChange(event) {
    this.setData({ 'form.birthday': event.detail.value });
  },

  async choosePhotos() {
    try {
      const paths = await adapter.chooseImages(['album'], 9);
      const existing = this.data.photos || [];
      const additions = paths.map((path, index) => ({ id: `photo-${Date.now()}-${index}`, path, isCover: !existing.length && index === 0, createdAt: Date.now() + index }));
      this.setData({ photos: [...existing, ...additions].slice(0, 9) });
    } catch (error) {
      if (!adapter.isCancel(error)) adapter.showToast('读取照片失败，请检查相册权限后重试');
    }
  },

  async takePhoto() {
    try {
      const path = await adapter.chooseImage(['camera']);
      const existing = this.data.photos || [];
      this.setData({ photos: [...existing, { id: `photo-${Date.now()}`, path, isCover: !existing.length, createdAt: Date.now() }].slice(0, 9) });
    } catch (error) {
      if (!adapter.isCancel(error)) adapter.showToast('无法打开相机，请检查相机权限后重试');
    }
  },

  removePhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = (this.data.photos || []).filter((_, itemIndex) => itemIndex !== index);
    if (photos.length && !photos.some((photo) => photo.isCover)) photos[0].isCover = true;
    this.setData({ photos });
  },

  setCoverPhoto(event) {
    const index = Number(event.currentTarget.dataset.index);
    const photos = (this.data.photos || []).map((photo, itemIndex) => ({ ...photo, isCover: itemIndex === index }));
    this.setData({ photos });
  },

  async save() {
    const form = this.data.form;
    if (!form.name.trim()) {
      adapter.showToast('请先填写猫咪名字');
      return;
    }
    const payload = {
      name: form.name.trim(),
      age: form.age.trim(),
      birthday: form.birthday || undefined,
      traits: form.traits.split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean),
      personality: form.personality.trim() || undefined,
      likes: splitTags(form.likes),
      dislikes: splitTags(form.dislikes)
    };
    try {
      let savedCat;
      if (api.isLoggedIn()) {
        const data = this.data.editingId
          ? await api.updateCat(this.data.editingId, payload)
          : await api.createCat(payload);
        savedCat = api.normalizeCat(data.cat);
      } else {
        const existing = getActiveCats(storage.getCats()).find((cat) => cat.id === this.data.editingId);
        savedCat = createLocalCat({ ...form, ...payload, traits: payload.traits.join('、'), likes: payload.likes.join('、'), dislikes: payload.dislikes.join('、') }, this.data.photos || [], existing);
      }
      const localPatch = {
        photos: this.data.photos || [],
        birthday: form.birthday || '',
        ageText: calculateAge(form.birthday, form.age),
        humanRole: form.humanRole.trim(),
        speechStyle: form.speechStyle.trim(),
        catchphrase: form.catchphrase.trim()
      };
      storage.mergeCatLocal(savedCat.id, { ...savedCat, ...localPatch });
      if (api.isLoggedIn() && (localPatch.humanRole || localPatch.speechStyle || localPatch.catchphrase) && api.savePersona) {
        await api.savePersona(savedCat.id, { speechStyle: localPatch.speechStyle, catchphrase: localPatch.catchphrase, promptSnippet: localPatch.humanRole, status: 'confirmed' }).catch(() => {});
      }
      const cats = api.isLoggedIn() ? getActiveCats(await api.syncCats()) : getActiveCats(storage.getCats());
      const mergedCats = cats.map((cat) => cat.id === savedCat.id ? { ...cat, ...savedCat, ...localPatch } : cat);
      if (!storage.getCurrentCatId()) storage.setCurrentCatId(savedCat.id);
      storage.saveCats(mergedCats);
      adapter.showToast('已保存', 'success');
      setTimeout(() => adapter.navigateBack().catch(() => {}), 500);
    } catch (error) {
      if (api.isLoginError(error)) return api.openLogin();
      adapter.showToast(error.message || '保存失败，请重试');
    }
  }
});
