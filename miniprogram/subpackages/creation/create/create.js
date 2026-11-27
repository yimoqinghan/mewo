const api = require('../../../services/api');
const storage = require('../../../utils/storage');
const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');
const { CREATOR_STYLES, getEnabledStyleIds, withEnabled } = require('../../../utils/creator-styles');

const ASPECT_RATIOS = [
  { id: '1:1', name: '1:1', desc: '头像 / 贴纸' },
  { id: '3:4', name: '3:4', desc: '竖版海报' },
  { id: '4:3', name: '4:3', desc: '横版内容' },
  { id: '16:9', name: '16:9', desc: '横屏封面' }
];

Page({
  data: {
    photoPath: '', prompt: '', professionalPrompt: '', creatorMode: 'template', showAdvanced: false,
    aspectRatios: ASPECT_RATIOS, selectedAspectRatio: '1:1', negativePrompt: '',
    skills: withEnabled(), enabledSkillIds: CREATOR_STYLES.map((item) => item.id), activeSkillId: 'sticker-pop',
    imageModels: [], selectedImageModel: '', phase: 'idle', statusText: '', progressStage: '创作准备中', progressHint: '先准备参考图，随后会进入模型创作。', progress: 0, error: '', remaining: null, dailyLimit: 3,
    loggedIn: false, isVip: false, quotaExhausted: false, showPaywall: false, recordingField: '', voiceBusy: false,
    assets: { cloudSoft: asset('design-webp/cloud-soft.webp'), menuCat: asset('design-webp/cat-menu-perched.webp'), catRunLoading: asset('design/cat-run-loading.gif'), homeCat: asset('design-webp/cat-home.webp'), cameraIcon: asset('design-webp/ui/camera-icon-generated.webp'), albumIcon: asset('design-webp/ui/album-icon-generated.webp') }
  },

  onLoad() {
    storage.clearPendingGeneration();
    const enabledSkillIds = storage.getCreatorSkillIds();
    const selectedSkillIds = getEnabledStyleIds(enabledSkillIds);
    this.visible = true;
    this.epoch = 0;
    this.setData({ photoPath: storage.takePhotoDraft(), prompt: '', professionalPrompt: '', creatorMode: 'template', showAdvanced: false, selectedAspectRatio: '1:1', negativePrompt: '', enabledSkillIds: selectedSkillIds, skills: withEnabled(selectedSkillIds), activeSkillId: 'sticker-pop', phase: 'idle', error: '', showPaywall: false });
  },

  async onShow() {
    this.visible = true;
    const enabledSkillIds = getEnabledStyleIds(storage.getCreatorSkillIds());
    this.setData({ enabledSkillIds, skills: withEnabled(enabledSkillIds) });
    const loggedIn = api.isLoggedIn();
    this.setData({ loggedIn });
    const config = await api.getConfig().catch(() => ({}));
    if (!this.visible) return;
    const imageModels = config.imageModels || [];
    this.setData({ imageModels, dailyLimit: config.quota?.imageDailyFreeLimit || config.quota?.dailyFreeLimit || 3, selectedImageModel: this.data.selectedImageModel || ((imageModels[0] || {}).id || '') });
    if (!loggedIn) return;
    try {
      const quota = await api.getQuota();
      if (!this.visible) return;
      const remaining = quota.quota.imageRemaining ?? quota.quota.remaining;
      this.setData({ isVip: Boolean(quota.quota.isVip), remaining, quotaExhausted: !quota.quota.unlimited && remaining <= 0, error: '' });
    } catch (error) { if (this.visible) this.handleError(error); }
  },

  onHide() { this.visible = false; this.epoch++; this.stopProgressTicker(); if (this.data.recordingField) adapter.stopRecording(); },
  onUnload() { this.visible = false; this.epoch++; this.stopProgressTicker(); if (this.data.recordingField) adapter.stopRecording(); },

  startProgressTicker() {
    this.stopProgressTicker();
    this.progressTicker = setInterval(() => {
      if (this.data.phase !== 'generating' || this.data.progress >= 78) return;
      const nextProgress = Math.min(78, this.data.progress + (this.data.progress < 45 ? 3 : 2));
      const stage = nextProgress < 40 ? '正在理解画面描述' : (nextProgress < 65 ? '正在生成画面' : '正在整理画面细节');
      const hint = nextProgress < 40 ? 'AI 正在分析你的描述和参考图。' : (nextProgress < 65 ? '画面生成需要一点时间，进度会持续更新。' : '正在把画面整理成可预览的作品。');
      this.setData({ progress: nextProgress, progressStage: stage, progressHint: hint, statusText: stage });
    }, 1800);
  },

  stopProgressTicker() {
    if (this.progressTicker) clearInterval(this.progressTicker);
    this.progressTicker = null;
  },

  handleError(error) {
    if (error.code === 'QUOTA_EXCEEDED') return this.setData({ quotaExhausted: true, showPaywall: true, phase: 'idle', error: '今日生图次数已用完，聊天额度仍可独立使用。' });
    if (api.isLoginError(error)) return this.setData({ loggedIn: false, error: '请先登录，登录后即可开始 AI 创作。', phase: 'idle' });
    this.setData({ error: error.message || '暂时没有成功，请重试', phase: 'idle' });
  },

  login() { api.openLogin(); },
  selectCreatorMode(event) { if (this.data.phase !== 'idle') return; const creatorMode = event.currentTarget.dataset.mode === 'custom' ? 'custom' : 'template'; this.setData({ creatorMode, showAdvanced: false, error: '' }); },
  toggleAdvanced() { if (this.data.phase === 'idle') this.setData({ showAdvanced: !this.data.showAdvanced, creatorMode: 'custom' }); },
  onPromptInput(event) { this.setData({ prompt: event.detail.value, error: '' }); },
  onProfessionalPromptInput(event) { this.setData({ professionalPrompt: event.detail.value, error: '' }); },
  async toggleVoice(event) {
    if (this.data.phase !== 'idle' || this.data.voiceBusy) return;
    const field = event.currentTarget.dataset.field === 'professionalPrompt' ? 'professionalPrompt' : 'prompt';
    if (this.data.recordingField === field) return adapter.stopRecording();
    if (this.data.recordingField) return;
    this.setData({ recordingField: field, error: '' });
    try {
      const audioPath = await adapter.recordAudio();
      if (!audioPath) throw new Error('没有录到声音，请再试一次。');
      this.setData({ recordingField: '', voiceBusy: true });
      const assetId = await api.uploadAudio(audioPath);
      const result = await api.transcribeAudio(assetId);
      const text = String(result.text || '').trim();
      if (!text) throw new Error('没有识别到清晰语音，请再试一次。');
      const key = field === 'professionalPrompt' ? 'professionalPrompt' : 'prompt';
      const current = String(this.data[key] || '').trim();
      this.setData({ [key]: current ? `${current} ${text}` : text });
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ error: error.message || '语音识别失败，请重试。' });
    } finally {
      this.setData({ recordingField: '', voiceBusy: false });
    }
  },
  onNegativePromptInput(event) { this.setData({ negativePrompt: event.detail.value }); },
  selectAspectRatio(event) { if (this.data.phase === 'idle') this.setData({ selectedAspectRatio: event.currentTarget.dataset.ratio, error: '' }); },
  selectImageModel(event) { if (this.data.phase === 'idle') this.setData({ selectedImageModel: event.currentTarget.dataset.model || '', error: '' }); },
  selectSkill(event) { if (this.data.phase === 'idle') this.setData({ activeSkillId: event.currentTarget.dataset.skill || '', error: '' }); },
  openStyleTemplates() { adapter.navigateTo('/subpackages/creation/style-templates/style-templates'); },

  async choosePhoto(event) {
    if (this.data.phase !== 'idle') return;
    const source = event.currentTarget.dataset.source || 'album';
    if (source === 'camera') return adapter.navigateTo('/subpackages/creation/capture/capture?target=create');
    try { const path = await adapter.chooseImage([source]); this.setData({ photoPath: path, error: '' }); }
    catch (error) { if (!adapter.isCancel(error)) this.setData({ error: '无法读取照片，请检查相机或相册权限后重试。' }); }
  },
  clearPhoto() { if (this.data.phase === 'idle') this.setData({ photoPath: '', error: '' }); },

  handlePrimary() {
    if (!this.data.loggedIn) return this.login();
    if (this.data.quotaExhausted || this.data.remaining === 0) return this.setData({ showPaywall: true });
    return this.generate();
  },
  closePaymentNotice() { this.setData({ showPaywall: false }); },

  async generate() {
    if (this.submitting || this.data.phase !== 'idle') return;
    if (!this.data.loggedIn) return this.login();
    if (!this.data.isVip && this.data.remaining === 0) return this.setData({ showPaywall: true, quotaExhausted: true });
    const activeSkill = this.data.skills.find((item) => item.id === this.data.activeSkillId);
    const prompt = this.data.creatorMode === 'template'
      ? (activeSkill?.promptText || activeSkill?.prompt || '')
      : this.data.prompt.trim();
    if (!prompt) return this.setData({ error: '先描述一下你想生成的画面吧。' });
    this.submitting = true;
    this.setData({ phase: 'uploading', error: '', statusText: '正在准备你的创作…', progressStage: '正在准备素材', progressHint: '先完成参考图准备，再交给 AI 创作。', progress: 5 });
    try {
      await api.ensureLogin();
      let assetIds = [];
      if (this.data.photoPath) { this.setData({ statusText: '正在上传参考图…', progressStage: '正在上传参考图', progressHint: '图片只用于这次创作，上传完成后马上开始生成。', progress: 10 }); assetIds = [await api.uploadImage(this.data.photoPath)]; }
      const options = { mode: 'ai', prompt, professionalPrompt: this.data.creatorMode === 'custom' ? this.data.professionalPrompt.trim() : '', aspectRatio: this.data.selectedAspectRatio, skillId: this.data.creatorMode === 'template' ? (activeSkill?.id || '') : '', skillPrompt: this.data.creatorMode === 'template' ? (activeSkill?.prompt || '') : '' };
      if (this.data.selectedImageModel) options.model = this.data.selectedImageModel;
      if (this.data.creatorMode === 'custom' && this.data.negativePrompt.trim()) options.negativePrompt = this.data.negativePrompt.trim();
      const task = await api.createGeneration({ templateKey: 'ai-image', catIds: [], assetIds, requestKey: `ai-image-${Date.now()}-${Math.random().toString(36).slice(2)}`, options });
      if (this.visible) { this.setData({ phase: 'generating', remaining: task.remainingToday === undefined ? this.data.remaining : task.remainingToday, quotaExhausted: !task.unlimited && task.remainingToday === 0 }); this.watch(task); }
    } catch (error) { this.handleError(error); }
    finally { this.submitting = false; }
  },

  async watch(task) {
    const epoch = ++this.epoch;
    this.setData({ phase: 'generating', statusText: '已提交，AI 正在生成画面…', progressStage: 'AI 创作中', progressHint: '这一阶段通常需要 10–30 秒，进度会持续变化。', progress: 20 });
    this.startProgressTicker();
    try {
      const job = await api.waitForGeneration(task.jobId, {
        shouldStop: () => !this.visible || epoch !== this.epoch,
        onProgress: (item) => {
          if (item.status === 'queued') {
            return this.setData({ progressStage: '排队中', progressHint: '创作任务已提交，前面还有少量任务正在处理。', statusText: '创作排队中，很快就好…' });
          }
          if ((item.progress || 0) >= 85) {
            this.stopProgressTicker();
            return this.setData({ progress: 85, progressStage: '正在整理成品', progressHint: 'AI 已完成，正在整理文件和作品记录。', statusText: '正在整理最后的画面细节…' });
          }
          this.setData({ progress: Math.max(this.data.progress, item.progress || 20), progressStage: 'AI 创作中', progressHint: 'AI 正在生成画面，完成后会自动打开结果。', statusText: 'AI 正在生成画面…' });
        }
      });
      if (!this.visible || epoch !== this.epoch) return;
      this.stopProgressTicker();
      this.setData({ phase: 'idle' });
      await adapter.navigateTo(`/subpackages/creation/sticker-result/sticker-result?id=${encodeURIComponent(job.workId || job.result.workId)}`);
    } catch (error) {
      this.stopProgressTicker();
      if (error.code === 'POLL_STOPPED' || !this.visible || epoch !== this.epoch) return;
      this.handleError(error);
      api.getQuota().then((data) => { const remaining = data.quota.imageRemaining ?? data.quota.remaining; this.setData({ isVip: Boolean(data.quota.isVip), remaining, quotaExhausted: !data.quota.unlimited && remaining <= 0 }); }).catch(() => {});
    }
  },

  stopTap() {},
  openWorks() { adapter.navigateTo('/subpackages/creation/works/works'); }
});
