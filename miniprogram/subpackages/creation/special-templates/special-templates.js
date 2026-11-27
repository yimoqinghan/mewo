const adapter = require('../../../utils/adapter');
const storage = require('../../../utils/storage');
const { asset } = require('../../../utils/assets');
const { getSpecialSkills } = require('../../../services/special-creations');

Page({
  data: {
    type: 'gif',
    videoMode: false,
    title: 'GIF 模板',
    subtitle: '选一个动作方向，返回后调用真实模型生成。',
    skills: [],
    selectedSkillId: '',
    previewingVideoId: '',
    loading: true,
    skeletonItems: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    assets: { menuCat: asset('design-webp/cat-menu-perched.webp') }
  },

  onLoad(options) {
    const type = options?.type === 'emoji' ? 'emoji' : 'gif';
    const videoMode = options?.video === '1' && type === 'gif';
    const skills = getSpecialSkills(type, videoMode ? 'short-video' : '');
    this.setData({
      type,
      videoMode,
      title: videoMode ? '喵视频模板' : (type === 'emoji' ? '表情模板' : 'GIF 模板'),
      subtitle: videoMode ? '选一个喵的故事方向，返回后生成真实短视频。' : (type === 'emoji' ? '每张示例图都对应一个具体表情玩法，点击可放大查看。' : '每张示例动图都对应一个具体动作玩法，点击可放大查看。'),
      skills: [],
      selectedSkillId: options?.selected || '',
      previewingVideoId: '',
      loading: true
    });
    this.loadTimer = setTimeout(() => {
      this.setData({ skills: skills.map((item) => ({ ...item, imageReady: false })), loading: false });
    }, 80);
  },

  onUnload() { if (this.loadTimer) clearTimeout(this.loadTimer); },

  chooseSkill(event) {
    const skillId = event.currentTarget.dataset.id;
    if (!skillId) return;
    storage.setPendingSpecialTemplate({ type: this.data.type, videoMode: this.data.videoMode, skillId });
    adapter.navigateBack().catch(() => adapter.reLaunch('/subpackages/creation/special-create/special-create'));
  },

  previewSkill(event) {
    const skill = this.data.skills.find((item) => item.id === event.currentTarget.dataset.id);
    if (!skill?.example) return;
    if (this.data.videoMode) return this.setData({ previewingVideoId: this.data.previewingVideoId === skill.id ? '' : skill.id });
    adapter.previewImage(skill.example).catch(() => {});
  },

  toggleVideoPreview(event) {
    const skillId = event.currentTarget.dataset.id;
    if (!skillId) return;
    this.setData({ previewingVideoId: this.data.previewingVideoId === skillId ? '' : skillId });
  },

  onExampleLoad(event) {
    const skillId = event.currentTarget.dataset.id;
    if (!skillId) return;
    this.setData({ skills: this.data.skills.map((item) => item.id === skillId ? { ...item, imageReady: true } : item) });
  },

  back() { adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index')); }
});
