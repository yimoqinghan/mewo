const storage = require('../../../utils/storage');
const adapter = require('../../../utils/adapter');
const api = require('../../../services/api');
const { asset } = require('../../../utils/assets');
const env = require('../../../config/env');
const { isPublicStaticPath, remoteExtension, shouldDownloadSource } = require('../../../utils/media-source');
const { decorateCat } = require('../../../utils/cat-profile');
const { getSpecialSkills, getDefaultExpressionText } = require('../../../services/special-creations');
const { getActiveCats } = require('../../../utils/cat-archive');

function getDurationNote(duration, model) {
  const target = Number(duration) || 3;
  const min = Number(model?.minDuration || 0);
  return min > target ? `当前模型最低 ${min} 秒，会按 ${min} 秒提交。` : `目标时长 ${target} 秒，最终以模型返回为准。`;
}

Page({
  data: {
    type: 'gif',
    videoMode: false,
    title: 'GIF 动起来',
    subtitle: '让喵轻轻动一下，就很有戏。',
    cats: [],
    currentCat: null,
    catPhotos: [],
    sourcePath: '',
    sourceLabel: '还没有选择照片',
    skills: [],
    selectedSkillId: '',
    selectedSkill: null,
    videoModels: [],
    selectedVideoModelId: 'minimax-h3',
    selectedVideoModel: null,
    durationOptions: [3, 5, 8, 10, 15],
    duration: 3,
    durationNote: '默认目标 3 秒；部分模型最低 4 秒，提交时会自动保护。',
    aspectRatio: '9:16',
    creationMode: 'template',
    showAllSkills: false,
    visibleSkills: [],
    caption: '',
    captionCount: 0,
    captionTouched: false,
    emojiMode: 'static',
    phase: 'idle',
    statusText: '',
    progressStage: '创作准备中',
    progressHint: '先准备参考图，随后会进入模型创作。',
    error: '',
    resultPath: '',
    resultDownloadPath: '',
    resultMedia: null,
    resultWorkId: '',
    progress: 0,
    jobId: '',
    modelReady: true,
    availabilityNote: '',
    saved: false,
    saving: false,
    actionBusy: false,
    assets: {
      menuCat: asset('design-webp/cat-menu-perched.webp'),
      fallbackCat: asset('design-webp/cat-home.webp'),
      albumIcon: asset('design-webp/ui/album-icon-generated.webp'),
      cameraIcon: asset('design-webp/ui/camera-icon-generated.webp')
    }
  },

  onLoad(options) {
    adapter.showShareMenu().catch(() => {});
    const type = options?.type === 'emoji' ? 'emoji' : 'gif';
    const videoMode = options?.video === '1' && type === 'gif';
    const skills = getSpecialSkills(type, videoMode ? 'short-video' : '');
    this.setData({
      type,
      videoMode,
      title: videoMode ? '喵视频' : (type === 'emoji' ? '喵表情' : 'GIF 动起来'),
      subtitle: videoMode ? '围绕喵的日常与想象，创作一段专属短视频。' : (type === 'emoji' ? '把喵的小情绪做成一张有话要说的表情。' : '让喵轻轻动一下，把想说的话也带上。'),
      skills,
      selectedSkillId: '',
      selectedSkill: null,
      videoModels: [],
      selectedVideoModelId: 'minimax-h3',
      selectedVideoModel: null,
      duration: 3,
      durationNote: '默认目标 3 秒；部分模型最低 4 秒，提交时会自动保护。',
      creationMode: 'template',
      showAllSkills: false,
      visibleSkills: [],
      caption: '',
      captionCount: 0
    });
    this.loadModelAvailability(type);
    this.loadCats();
  },

  onShareAppMessage() {
    const workId = this.data.resultWorkId;
    const path = workId
      ? (this.data.videoMode ? `/subpackages/creation/video-feed/video-feed?workId=${encodeURIComponent(workId)}` : `/subpackages/creation/sticker-result/sticker-result?id=${encodeURIComponent(workId)}`)
      : `/subpackages/creation/special-create/special-create?type=${this.data.type}${this.data.videoMode ? '&video=1' : ''}`;
    const imageUrl = this.data.videoMode
      ? (this.data.resultMedia?.posterUrl || this.data.resultMedia?.coverUrl || this.data.assets.fallbackCat)
      : (this.data.resultPath || this.data.assets.fallbackCat);
    return { title: this.data.statusText || `${this.data.title}，和喵一起玩`, path, imageUrl };
  },

  onShareTimeline() {
    const workId = this.data.resultWorkId;
    const query = workId
      ? (this.data.videoMode ? `workId=${encodeURIComponent(workId)}` : `id=${encodeURIComponent(workId)}`)
      : `type=${this.data.type}${this.data.videoMode ? '&video=1' : ''}`;
    const imageUrl = this.data.videoMode
      ? (this.data.resultMedia?.posterUrl || this.data.resultMedia?.coverUrl || this.data.assets.fallbackCat)
      : (this.data.resultPath || this.data.assets.fallbackCat);
    return { title: this.data.statusText || `${this.data.title}，和喵一起玩`, query, imageUrl };
  },

  onShow() {
    const pending = storage.getPendingSpecialTemplate();
    if (!pending || pending.type !== this.data.type || Boolean(pending.videoMode) !== Boolean(this.data.videoMode)) return;
    storage.clearPendingSpecialTemplate();
    const selectedSkill = this.data.skills.find((skill) => skill.id === pending.skillId);
    if (!selectedSkill) return;
    const next = { selectedSkillId: selectedSkill.id, selectedSkill, error: '' };
    if (this.data.videoMode) next.duration = Number(selectedSkill.duration) || 3;
    if (this.data.videoMode && selectedSkill.model) {
      next.selectedVideoModelId = selectedSkill.model;
      next.selectedVideoModel = this.data.videoModels.find((item) => item.id === selectedSkill.model) || this.data.selectedVideoModel;
    }
    if (this.data.videoMode) next.durationNote = getDurationNote(next.duration, next.selectedVideoModel);
    if (this.data.type === 'emoji' && !this.data.captionTouched) {
      const caption = getDefaultExpressionText(selectedSkill);
      next.caption = caption;
      next.captionCount = caption.length;
    }
    this.setData(next);
  },

  async loadModelAvailability(type) {
    try {
      const config = await api.getConfig();
      if (this.data.videoMode) {
        const videoModels = config.videoModels || [];
        const preferredVideoModelId = this.data.selectedSkill?.model || this.data.selectedVideoModelId;
        const selectedVideoModelId = videoModels.some((item) => item.id === preferredVideoModelId)
          ? preferredVideoModelId
          : (videoModels.find((item) => item.supportsImageReference)?.id || videoModels[0]?.id || '');
        const selectedVideoModel = videoModels.find((item) => item.id === selectedVideoModelId) || null;
        return this.setData({
          videoModels,
          selectedVideoModelId,
          selectedVideoModel,
          modelReady: config.features?.specialVideo !== false && Boolean(selectedVideoModel?.supportsImageReference),
          availabilityNote: config.features?.specialVideo === false ? '短视频模型暂时不可用，请稍后再试。' : ''
        });
      }
      const ready = type === 'gif' ? config.features?.specialGif : config.features?.specialEmoji;
      if (ready === false) {
        this.setData({ modelReady: false, availabilityNote: type === 'gif' ? '动图服务暂时不可用，请稍后再试。' : '表情服务暂时不可用，请稍后再试。' });
      }
    } catch {
      // 配置读取失败时保留可提交状态，服务端会返回明确错误。
    }
  },

  onUnload() { this.stopProgressTicker(); clearTimeout(this.generateTimer); },

  startProgressTicker() {
    this.stopProgressTicker();
    this.progressTicker = setInterval(() => {
      if (this.data.phase !== 'generating' || this.data.progress >= 78) return;
      const nextProgress = Math.min(78, this.data.progress + (this.data.progress < 45 ? 3 : 2));
      const stage = nextProgress < 40 ? '正在分析参考图' : (nextProgress < 65 ? '正在生成动作帧' : '正在合成循环效果');
      const hint = nextProgress < 40 ? '模型正在理解喵的姿态和画面关系。' : (nextProgress < 65 ? '动作生成需要一点时间，进度会持续更新。' : '正在把画面整理成可下载、可分享的成品。');
      this.setData({ progress: nextProgress, progressStage: stage, progressHint: hint, statusText: stage });
    }, 1800);
  },

  stopProgressTicker() {
    if (this.progressTicker) clearInterval(this.progressTicker);
    this.progressTicker = null;
  },

  loadCats() {
    const cats = getActiveCats(storage.getCats()).map(decorateCat);
    if (!cats.length) return this.setData({ cats: [] });
    const currentId = storage.getCurrentCatId() || cats[0].id;
    const currentCat = cats.find((cat) => cat.id === currentId) || cats[0];
    storage.setCurrentCatId(currentCat.id);
    const catPhotos = currentCat.photos.length ? currentCat.photos : [{ id: 'avatar', path: currentCat.avatar, assetId: currentCat.avatarAssetId, isCover: true }];
    this.setData({ cats, currentCat, catPhotos, sourcePath: catPhotos[0].path, sourceLabel: `${currentCat.name} 的档案照片`, error: '', resultPath: '', resultDownloadPath: '', resultMedia: null });
  },

  async chooseFromAlbum() { await this.chooseNewPhoto(['album']); },
  async takePhoto() { await this.chooseNewPhoto(['camera']); },

  async chooseNewPhoto(sourceType) {
    try {
      const path = await adapter.chooseImage(sourceType);
      this.setData({ sourcePath: path, sourceLabel: '刚刚选的照片', error: '' });
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ error: '读取照片失败，请检查相册或相机权限后重试。' });
    }
  },

  selectSkill(event) {
    const selectedSkill = this.data.skills.find((skill) => skill.id === event.currentTarget.dataset.id);
    if (!selectedSkill) return;
    const next = { selectedSkillId: selectedSkill.id, selectedSkill, error: '' };
    if (this.data.videoMode) next.duration = Number(selectedSkill.duration) || 3;
    if (this.data.videoMode && selectedSkill.model) {
      next.selectedVideoModelId = selectedSkill.model;
      next.selectedVideoModel = this.data.videoModels.find((item) => item.id === selectedSkill.model) || this.data.selectedVideoModel;
    }
    if (this.data.videoMode) next.durationNote = getDurationNote(next.duration, next.selectedVideoModel);
    if (this.data.type === 'emoji' && !this.data.captionTouched) {
      const caption = getDefaultExpressionText(selectedSkill);
      next.caption = caption;
      next.captionCount = caption.length;
    }
    this.setData(next);
  },

  selectVideoModel(event) {
    const modelId = event.currentTarget.dataset.id;
    const selectedVideoModel = this.data.videoModels.find((item) => item.id === modelId);
    if (!selectedVideoModel || selectedVideoModel.requiresVideoInput || !selectedVideoModel.supportsImageReference) {
      return this.setData({ error: '这个模型需要视频输入，当前短视频流程先使用猫咪照片生成。' });
    }
    const durationNote = getDurationNote(this.data.duration, selectedVideoModel);
    this.setData({ selectedVideoModelId: modelId, selectedVideoModel, durationNote, error: '' });
  },

  selectDuration(event) {
    const duration = Number(event.currentTarget.dataset.duration) || 3;
    const min = Number(this.data.selectedVideoModel?.minDuration || 0);
    this.setData({
      duration,
      durationNote: min > duration ? `当前模型最低 ${min} 秒，会按 ${min} 秒提交。` : `目标时长 ${duration} 秒，最终以模型返回为准。`,
      error: ''
    });
  },

  openTemplatePicker() {
    const video = this.data.videoMode ? '&video=1' : '';
    const selected = this.data.selectedSkillId ? `&selected=${encodeURIComponent(this.data.selectedSkillId)}` : '';
    adapter.navigateTo(`/subpackages/creation/special-templates/special-templates?type=${this.data.type}${video}${selected}`).catch(() => {
      this.setData({ error: '模板列表暂时打不开，请稍后重试。' });
    });
  },

  previewSkill(event) {
    const selectedSkill = this.data.skills.find((skill) => skill.id === event.currentTarget.dataset.id);
    if (!selectedSkill?.example) return;
    if (this.data.videoMode) return adapter.navigateTo('/subpackages/creation/video-feed/video-feed', { animationType: 'none', animationDuration: 0 }).catch(() => {});
    adapter.previewImage(selectedSkill.example).catch(() => {});
  },

  selectCreationMode(event) {
    const creationMode = event.currentTarget.dataset.mode === 'custom' ? 'custom' : 'template';
    this.setData({ creationMode, error: '' });
  },

  toggleAllSkills() {
    const showAllSkills = !this.data.showAllSkills;
    this.setData({ showAllSkills, visibleSkills: showAllSkills ? this.data.skills : this.data.skills.slice(0, 6) });
  },

  onCaptionInput(event) {
    const caption = String(event.detail.value || '');
    this.setData({ caption, captionCount: caption.length, captionTouched: true, error: '' });
  },

  useSkillText() {
    const caption = getDefaultExpressionText(this.data.selectedSkill) || this.data.selectedSkill?.desc || '';
    this.setData({ caption, captionCount: caption.length, captionTouched: true, error: '' });
  },

  selectEmojiMode(event) {
    const emojiMode = event.currentTarget.dataset.mode === 'animated' ? 'animated' : 'static';
    this.setData({ emojiMode, error: '' });
  },

  selectedAssetId() {
    const photo = this.data.catPhotos.find((item) => item.path === this.data.sourcePath);
    if (photo?.assetId) return photo.assetId;
    if (this.data.currentCat && this.data.sourcePath === this.data.currentCat.avatar) return this.data.currentCat.avatarAssetId || '';
    return '';
  },

  async generate() {
    if (this.data.phase === 'generating') return;
    if (!this.data.sourcePath) return this.setData({ error: '先选一张照片，才能开始创作。' });
    if (this.data.creationMode === 'template' && !this.data.selectedSkill) return this.setData({ error: '先去选择一个模板，再开始创作。' });
    if (this.data.type === 'emoji' && !this.data.caption.trim()) return this.setData({ error: '先写一句表情文字，让它知道这次想表达什么。' });
    if (!this.data.modelReady) return this.setData({ error: this.data.availabilityNote || '当前服务暂时不可用。' });
    if (!api.isLoggedIn()) return this.setData({ error: '请先登录，真实模型创作需要账户。' });

    this.setData({
      phase: 'generating',
      statusText: this.data.videoMode ? '正在围绕喵创作短视频…' : (this.data.type === 'gif' ? '喵正在准备动起来…' : '喵正在把这句话变成表情…'),
      progressStage: '正在准备素材',
      progressHint: '先完成参考图准备，再交给模型创作。',
      progress: 5,
      resultPath: '',
      resultDownloadPath: '',
      resultMedia: null,
      resultWorkId: '',
      saved: false,
      saving: false,
      error: ''
    });
    try {
      let assetId = this.selectedAssetId();
      if (!assetId) {
        let uploadPath = this.data.sourcePath;
        if (isPublicStaticPath(uploadPath, env.assetBaseUrl)) {
          this.setData({ statusText: '正在准备这张档案照片…', progressStage: '正在准备参考图', progressHint: '正在把参考图安全交给创作服务。', progress: 10 });
          // 公开静态素材由服务端导入 COS，避免小程序开发者工具对远程 WebP
          // 临时文件支持不完整；用户照片和档案照片走下载后客户端直传。
          const imported = await api.importImageUrl(uploadPath, 'input');
          assetId = imported.assetId;
        }
        if (!assetId) {
          if (shouldDownloadSource(uploadPath, env.assetBaseUrl)) {
            uploadPath = await adapter.downloadFile(uploadPath, { extension: remoteExtension(uploadPath) });
          }
          this.setData({ statusText: '正在上传这张照片…', progressStage: '正在上传参考图', progressHint: '图片只用于这次创作，上传完成后马上开始生成。', progress: 12 });
          assetId = await api.uploadImage(uploadPath, 'input');
        }
      }
      const catId = this.data.currentCat?.id || '';
      const job = await api.createGeneration({
        templateKey: this.data.videoMode ? 'special-video' : (this.data.type === 'gif' ? 'special-gif' : 'special-emoji'),
        catIds: catId ? [catId] : [],
        assetIds: [assetId],
        requestKey: `special-${this.data.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        options: {
          text: this.data.caption.trim(),
          mediaMode: this.data.type === 'emoji' ? this.data.emojiMode : 'animated',
          prompt: this.data.creationMode === 'custom' ? this.data.caption.trim() : '',
          skillId: this.data.creationMode === 'template' ? this.data.selectedSkill.id : '',
          skillPrompt: this.data.creationMode === 'template' ? this.data.selectedSkill.prompt : '',
          aspectRatio: this.data.videoMode ? this.data.aspectRatio : '1:1',
          duration: this.data.videoMode ? this.data.duration : undefined,
          model: this.data.videoMode ? this.data.selectedVideoModelId : undefined,
          negativePrompt: '水印、乱码、错误的猫咪肢体、重复主体、过度复杂背景'
        }
      });
      this.setData({ jobId: job.jobId, statusText: '已提交，模型正在生成视频…', progressStage: '模型创作中', progressHint: this.data.videoMode ? '视频模型通常需要几分钟，期间可以离开页面，稍后到喵作查看。' : '这一阶段通常需要 10–30 秒，进度会持续变化。', progress: 20 });
      this.startProgressTicker();
      const result = await api.waitForGeneration(job.jobId, {
        timeoutMs: this.data.videoMode ? 3600000 : 150000,
        onProgress: (snapshot) => {
          if (snapshot.status === 'queued') {
            return this.setData({ progressStage: '排队中', progressHint: '创作任务已提交，前面还有少量任务正在处理。', statusText: '已经排上队了，马上开始…' });
          }
          if ((snapshot.progress || 0) >= 85) {
            this.stopProgressTicker();
            return this.setData({ progress: 85, progressStage: '正在整理成品', progressHint: '模型已完成，正在整理文件和作品记录。', statusText: '正在整理最后的画面细节…' });
          }
          this.setData({ progress: Math.max(this.data.progress, snapshot.progress || 20), progressStage: '模型创作中', progressHint: '模型正在生成动作帧，完成后会自动展示结果。', statusText: '正在生成动作帧…' });
        }
      });
      const resultMedia = result.result?.media || null;
      const resultPath = resultMedia?.url || result.result?.image?.url || '';
      const resultDownloadPath = resultMedia?.downloadUrl || resultPath;
      if (!resultPath) throw new Error('模型已完成，但暂时拿不到生成文件');
      const resultWorkId = result.workId || result.result?.workId || '';
      this.stopProgressTicker();
      const effectiveDuration = result.result?.effectiveDuration || result.result?.requestedDuration || this.data.duration;
      this.setData({ phase: 'success', resultPath, resultDownloadPath, resultMedia, resultWorkId, durationNote: this.data.videoMode ? `已生成约 ${effectiveDuration} 秒 · 默认目标 3 秒` : this.data.durationNote, statusText: this.data.videoMode ? '喵视频已生成' : (this.data.type === 'gif' || this.data.emojiMode === 'animated' ? '动图已生成' : '表情已生成'), progressStage: '创作完成', progressHint: '作品已经准备好，可以预览、下载或分享。', progress: 100 });
      if (resultWorkId) this.saveGeneratedWork(resultWorkId, true);
    } catch (error) {
      this.stopProgressTicker();
      const message = error?.message || error?.errMsg || '';
      this.setData({
        phase: 'error',
        statusText: '',
        progressStage: '生成未完成',
        progressHint: '',
        error: message || '参考图准备失败，请重新选择照片后重试。'
      });
    }
  },

  async saveGeneratedWork(workId, silent = false) {
    if (!workId || this.data.saving || this.data.saved) return;
    this.setData({ saving: true });
    try {
      await api.saveWork(workId);
      this.setData({ saved: true, saving: false });
      if (!silent) adapter.showToast('已保存到喵作');
    } catch (error) {
      this.setData({ saving: false });
      if (!silent) this.setData({ error: error.message || '保存失败，请稍后重试。' });
    }
  },

  async saveResult() {
    if (this.data.resultWorkId) return this.saveGeneratedWork(this.data.resultWorkId, false);
    this.setData({ error: '当前结果还没有作品记录，请重新生成后再试。' });
  },

  previewResult() {
    if (this.data.resultPath && !this.data.videoMode) adapter.previewImage(this.data.resultPath).catch(() => {});
  },

  async downloadResult() {
    if (!this.data.resultPath || this.data.actionBusy) return;
    this.setData({ actionBusy: true, error: '' });
    try {
      const extension = this.data.videoMode ? 'mp4' : (this.data.type === 'gif' || this.data.emojiMode === 'animated' ? 'gif' : 'png');
      const localPath = await adapter.downloadFile(this.data.resultDownloadPath || this.data.resultPath, { extension });
      if (this.data.videoMode) await adapter.saveVideoToAlbum(localPath);
      else await adapter.saveImageToAlbum(localPath);
      adapter.showToast(this.data.videoMode ? '已保存到手机相册' : '已保存到手机相册');
    } catch (error) {
      this.setData({ error: error.message || '保存到手机失败，请检查相册权限。' });
    } finally {
      this.setData({ actionBusy: false });
    }
  },

  async shareResult() {
    if (!this.data.resultPath || this.data.actionBusy) return;
    if (this.data.videoMode && !adapter.canShareVideo()) return this.setData({ error: '当前微信版本暂不支持视频分享，请先保存到相册。' });
    if (!this.data.videoMode && !adapter.canShareImage()) return this.setData({ error: '当前微信版本暂不支持图片分享。' });
    this.setData({ actionBusy: true, error: '' });
    try {
      const extension = this.data.videoMode ? 'mp4' : (this.data.type === 'gif' || this.data.emojiMode === 'animated' ? 'gif' : 'png');
      const localPath = await adapter.downloadFile(this.data.resultDownloadPath || this.data.resultPath, { extension });
      if (this.data.videoMode) await adapter.shareVideo(localPath);
      else await adapter.shareImage(localPath);
    } catch (error) {
      this.setData({ error: error.message || '分享失败，请稍后重试。' });
    } finally {
      this.setData({ actionBusy: false });
    }
  },

  openVideoFeed() {
    if (!this.data.videoMode) return;
    adapter.navigateTo(`/subpackages/creation/video-feed/video-feed${this.data.resultWorkId ? `?workId=${encodeURIComponent(this.data.resultWorkId)}` : ''}`, { animationType: 'none', animationDuration: 0 }).catch(() => {
      this.setData({ error: '全屏播放器暂时打不开，请稍后重试。' });
    });
  },

  retry() { this.stopProgressTicker(); this.setData({ phase: 'idle', statusText: '', progressStage: '创作准备中', progressHint: '先准备参考图，随后会进入模型创作。', error: '', resultPath: '', resultDownloadPath: '', resultMedia: null, resultWorkId: '', progress: 0, jobId: '', saved: false, saving: false }); },
  back() { adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index')); }
});
