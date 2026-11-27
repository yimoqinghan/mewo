const adapter = require('../../../utils/adapter');
const storage = require('../../../utils/storage');
const { withEnabled, getEnabledStyleIds } = require('../../../utils/creator-styles');
const { asset } = require('../../../utils/assets');

Page({
  data: { styles: [], enabledCount: 0, assets: { cloudSoft: asset('design-webp/cloud-soft.webp'), menuCat: asset('design-webp/cat-menu-perched.webp') } },

  onShow() {
    const enabledIds = getEnabledStyleIds(storage.getCreatorSkillIds());
    const previousReady = new Map(this.data.styles.map((item) => [item.id, item.imageReady]));
    const styles = withEnabled(enabledIds).map((item) => ({ ...item, imageReady: previousReady.get(item.id) === true }));
    this.setData({ styles, enabledCount: enabledIds.length });
  },

  back() { adapter.navigateBack().catch(() => adapter.reLaunch('/subpackages/creation/create/create')); },

  toggleStyle(event) {
    const styleId = event.currentTarget.dataset.style;
    const enabled = new Set(this.data.styles.filter((item) => item.enabled).map((item) => item.id));
    if (enabled.has(styleId)) {
      if (enabled.size === 1) return;
      enabled.delete(styleId);
    } else {
      enabled.add(styleId);
    }
    const enabledIds = [...enabled];
    storage.saveCreatorSkillIds(enabledIds);
    this.setData({ styles: withEnabled(enabledIds), enabledCount: enabledIds.length });
  },

  previewStyle(event) {
    const style = this.data.styles.find((item) => item.id === event.currentTarget.dataset.style);
    if (style?.example) adapter.previewImage(style.example).catch(() => {});
  },

  onStyleImageLoad(event) {
    const styleId = event.currentTarget.dataset.style;
    if (!styleId) return;
    this.setData({ styles: this.data.styles.map((item) => item.id === styleId ? { ...item, imageReady: true } : item) });
  }
});
