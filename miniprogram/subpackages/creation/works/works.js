const storage = require('../../../utils/storage');
const api = require('../../../services/api');
const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');

const CATEGORY_META = [
  { id: 'all', label: '全部' },
  { id: 'emoji', label: '表情' },
  { id: 'gif', label: 'GIF' },
  { id: 'video', label: '视频' },
  { id: 'shape', label: '异形' },
  { id: 'ai', label: 'AI 生成' },
  { id: 'other', label: '其他' }
];

function formatWorkTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '生成时间未知';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function getCategoryId(work) {
  const key = String(work.templateKey || work.type || '').toLowerCase();
  if (work.outputMime === 'video/mp4' || key.includes('video')) return 'video';
  if (work.outputMime === 'image/gif') return 'gif';
  if (key === 'special-emoji' || key.includes('emoji')) return 'emoji';
  if (key === 'special-gif' || key.includes('gif')) return 'gif';
  if (key === 'pet-sticker' || key === 'shape' || key.includes('shape')) return 'shape';
  if (key === 'ai-image' || key.includes('image') || key.includes('comic') || key.includes('dress')) return 'ai';
  return 'other';
}

function decorateWork(work) {
  const categoryId = getCategoryId(work);
  const category = CATEGORY_META.find((item) => item.id === categoryId);
  return {
    ...work,
    categoryId,
    categoryLabel: category ? category.label : '其他',
    image: work.image || work.cover?.url || asset('design-webp/cat-home.webp'),
    isVideo: work.outputMime === 'video/mp4',
    imageReady: Boolean(work.imageReady),
    imageError: Boolean(work.imageError),
    templateName: work.templateName || work.title || '宠物创作',
    catName: work.catName || (work.cats || []).map((cat) => cat.name).join('、') || '当前猫咪',
    text: work.text || work.body || '把今天的可爱留住。',
    createdAtLabel: formatWorkTime(work.createdAt || work.created_at)
  };
}

Page({
  data: {
    works: [],
    filteredWorks: [],
    selectedCategory: 'all',
    categories: CATEGORY_META.map((item) => ({ ...item, count: 0 })),
    loadingMore: false,
    hasMore: false,
    assets: { menuCat: asset('design-webp/cat-menu-perched.webp') }
  },

  updateFilter(works, selectedCategory = this.data.selectedCategory) {
    const normalized = works.map(decorateWork);
    const filteredWorks = selectedCategory === 'all'
      ? normalized
      : normalized.filter((work) => work.categoryId === selectedCategory);
    const categories = CATEGORY_META.map((item) => ({
      ...item,
      count: item.id === 'all' ? normalized.length : normalized.filter((work) => work.categoryId === item.id).length
    }));
    this.setData({ works: normalized, filteredWorks, categories, selectedCategory });
  },

  selectCategory(event) {
    this.updateFilter(this.data.works, event.currentTarget.dataset.category || 'all');
  },

  openWork(event) {
    const id = event.currentTarget.dataset.id;
    const work = this.data.works.find((item) => item.id === id);
    if (id && work?.isVideo) return adapter.navigateTo(`/subpackages/creation/video-feed/video-feed?workId=${encodeURIComponent(id)}`, { animationType: 'none', animationDuration: 0 });
    if (id) adapter.navigateTo(`/subpackages/creation/sticker-result/sticker-result?id=${encodeURIComponent(id)}`);
  },

  updateWorkImageState(event, state) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const update = (items) => items.map((item) => item.id === id
      ? { ...item, imageReady: state === 'loaded', imageError: state === 'error' }
      : item);
    const works = update(this.data.works);
    const filteredWorks = update(this.data.filteredWorks);
    storage.saveWorks(works);
    this.setData({ works, filteredWorks });
  },

  handleWorkImageLoad(event) {
    this.updateWorkImageState(event, 'loaded');
  },

  handleWorkImageError(event) {
    this.updateWorkImageState(event, 'error');
  },

  async onShow() {
    if (!api.isLoggedIn()) {
      this.updateFilter([]);
      this.nextCursor = '';
      this.setData({ loadingMore: false, hasMore: false });
      return;
    }
    await this.loadWorks(true);
  },

  async loadWorks(reset = false) {
    if (this.data.loadingMore) return;
    if (!reset && !this.nextCursor) return;
    this.setData({ loadingMore: true });
    try {
      const data = await api.listWorks({ saved: true, limit: 50, before: reset ? '' : this.nextCursor });
      const works = reset ? (data.items || []) : [...this.data.works, ...(data.items || [])];
      this.nextCursor = data.nextCursor || '';
      storage.saveWorks(works);
      this.updateFilter(works);
      this.setData({ loadingMore: false, hasMore: Boolean(this.nextCursor) });
    } catch (error) {
      this.setData({ loadingMore: false });
      if (api.isLoginError(error)) {
        this.updateFilter([]);
        return;
      }
      if (reset) {
        this.nextCursor = '';
        this.updateFilter(storage.getWorks());
      }
      adapter.showToast(error.message || '作品加载失败，请重试');
    }
  },

  onReachBottom() {
    if (api.isLoggedIn() && this.nextCursor) this.loadWorks(false);
  },

  goCreate() {
    if (!api.isLoggedIn()) return api.openLogin();
    adapter.navigateTo('/subpackages/creation/create/create');
  }
});
