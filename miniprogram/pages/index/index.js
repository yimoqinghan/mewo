const storage = require('../../utils/storage');
const adapter = require('../../utils/adapter');
const { asset } = require('../../utils/assets');
const { getActiveCats } = require('../../utils/cat-archive');

const pageAssets = {
  cloudSoft: asset('design-webp/cloud-soft.webp'), lowerHills: asset('design-webp/lower-hills.webp'), officialLogo: asset('design-webp/official-logo.webp'),
  voiceIcon: asset('design-webp/ui/voice-icon-generated.webp'), mineIcon: asset('design-webp/ui/mine-icon-generated.webp'),
  homeCat: asset('design-webp/cat-home-cool-stand.webp'), homeCatBlink: asset('design-webp/cat-home-cool-stand-blink.webp'),
  touchCat: asset('design-webp/cat-touch.webp'), menuCat: asset('design-webp/cat-menu-perched.webp'), menuCatBlink: asset('design-webp/cat-menu-perched-blink.webp'),
  heart: asset('design/heart.svg'), touchHand: asset('design-webp/touch-hand.webp'), touchRipple: asset('design/touch-ripple.svg'),
  albumIcon: asset('design-webp/ui/album-icon-generated.webp'), cameraIcon: asset('design-webp/ui/camera-icon-generated.webp'), chatIcon: asset('design-webp/ui/chat-icon-generated.webp'),
  moduleCreate: asset('module-entries/create.webp'), modulePresence: asset('module-entries/presence.webp'),
  modulePlay: asset('module-entries/play.webp'), moduleContent: asset('module-entries/content.webp'), moduleHome: asset('module-entries/home.webp'), moduleCareer: asset('module-entries/career.webp'),
  traceMapIcon: asset('design-webp/ui/stray-cat-trace-marker-generated.png')
};

const entryIcon = (relativePath) => asset(relativePath);

const modules = [
  {
    key: 'create', title: '喵创作', eyebrow: '把猫咪变成作品', subtitle: '拍照 · 生成', color: 'pink', icon: pageAssets.moduleCreate,
    submodules: [
      { key: 'camera', title: '喵喵相机', subtitle: '美颜拍照，模板直接用', icon: entryIcon('submodule-icons-v2/create-camera.webp'), variant: 'split' },
      { key: 'ai', title: 'AI 漫画', subtitle: '把日常变成专属漫画', icon: entryIcon('submodule-icons-v2/create-comic.webp'), variant: 'poster' },
      { key: 'video', title: '喵视频', subtitle: '猫咪短片，一键成片', icon: entryIcon('submodule-icons-v2/create-video.webp'), variant: 'edge' },
      { key: 'gif', title: 'GIF 动起来', subtitle: '做动效和循环短片', icon: entryIcon('submodule-icons-v2/create-gif.webp'), variant: 'stage' },
      { key: 'emoji', title: '喵表情', subtitle: '做聊天里的专属表情', icon: entryIcon('submodule-icons-v2/create-emoji.webp'), variant: 'stage' },
      { key: 'works', title: '喵作收藏', subtitle: '看看最近生成的作品', icon: entryIcon('submodule-icons-v2/create-works.webp'), variant: 'compact' }
    ]
  },
  {
    key: 'presence', title: '有喵在', eyebrow: '记录关系与日常陪伴', subtitle: '关系 · 陪伴', color: 'rose', icon: pageAssets.modulePresence,
    submodules: [
      { key: 'cats', title: '喵档案', subtitle: '多只猫咪，分别管理', icon: entryIcon('submodule-icons-v2/presence-cats.webp'), variant: 'portrait' },
      { key: 'chat', title: '和喵说话', subtitle: '陪喵聊聊心里话', icon: entryIcon('submodule-icons-v2/presence-chat.webp'), variant: 'split' },
      { key: 'calendar', title: '喵日历', subtitle: '生日、驱虫、疫苗提醒', icon: entryIcon('submodule-icons-v2/presence-calendar.webp'), variant: 'edge' },
      { key: 'voice', title: '喵声', subtitle: '听见喵的声音和回应', icon: entryIcon('submodule-icons-v2/presence-voice.webp'), variant: 'poster' },
      { key: 'daily', title: '喵日常', subtitle: '把今天的小事留下来', icon: entryIcon('submodule-icons-v2/presence-daily.webp'), variant: 'stage' },
      { key: 'trace-map', title: '喵迹地图', subtitle: '记录遇见过的流浪猫', icon: pageAssets.traceMapIcon, variant: 'poster' }
    ]
  },
  {
    key: 'play', title: '来玩喵', eyebrow: '轻量玩法与随机惊喜', subtitle: '好运 · 游戏', color: 'yellow', icon: pageAssets.modulePlay,
    submodules: [
      { key: 'fortune', title: '喵老仙', subtitle: '问一问今天的喵运', icon: entryIcon('submodule-icons-v2/play-fortune.webp'), variant: 'portrait' },
      { key: 'cyber-blessing', title: '赛博祈福', subtitle: '轻敲一下，给今天加点好运', icon: entryIcon('design-webp/ui/cyber-blessing/wood-fish-generated.png'), variant: 'poster' },
      { key: 'daily-luck', title: '今日喵运', subtitle: '抽一张今日好运签', icon: entryIcon('submodule-icons-v2/play-luck.webp'), variant: 'edge' },
      { key: 'blindbox', title: '职业盲盒', subtitle: '看看喵今天做什么', icon: entryIcon('submodule-icons-v2/play-blindbox.webp'), variant: 'split' },
      { key: 'coins', title: '喵币小铺', subtitle: '用趣味奖励换点好东西', icon: entryIcon('submodule-icons-v2/play-shop.webp'), variant: 'stage' }
    ]
  },
  {
    key: 'content', title: '喵有料', eyebrow: '知识、故事与内容灵感', subtitle: '知识 · 灵感', color: 'blue', icon: pageAssets.moduleContent,
    submodules: [
      { key: 'knowledge', title: '猫咪知识', subtitle: '养猫小知识，随手查', icon: entryIcon('submodule-icons-v2/content-knowledge.webp'), variant: 'portrait' },
      { key: 'cat-translator', title: '猫咪翻译', subtitle: '看动作，听喵声', icon: entryIcon('submodule-icons-v2/content-cat-translator.webp'), variant: 'split' },
      { key: 'jokes', title: '喵笑话', subtitle: '今天也要笑一下', icon: entryIcon('submodule-icons-v2/content-jokes.webp'), variant: 'edge' },
      { key: 'stories', title: '猫咪话本', subtitle: '抽象、荒诞、搞怪小剧场', icon: entryIcon('submodule-icons-v2/content-stories.webp'), variant: 'poster' },
      { key: 'seasons', title: '四季灵感', subtitle: '把季节做成一张作品', icon: entryIcon('submodule-icons-v2/content-seasons.webp'), variant: 'stage' },
      { key: 'goodies', title: '好物分享', subtitle: '猫咪生活里的实用发现', icon: entryIcon('submodule-icons-v2/content-goodies.webp'), variant: 'split' }
    ]
  },
  {
    key: 'home', title: '喵居里', eyebrow: '共同生活与长期沉淀', subtitle: '生活 · 记忆', color: 'purple', icon: pageAssets.moduleHome,
    submodules: [
      { key: 'cloud-home', title: '云上家', subtitle: '我们的温暖小窝', icon: entryIcon('submodule-icons-v2/home-house.webp'), variant: 'portrait' },
      { key: 'family', title: '猫咪家谱', subtitle: '把家里的关系理清楚', icon: entryIcon('submodule-icons-v2/home-family.webp'), variant: 'split' },
      { key: 'album', title: '全家福', subtitle: '和每一只喵合张影', icon: entryIcon('submodule-icons-v2/home-album.webp'), variant: 'poster' },
      { key: 'memory', title: '共同记忆', subtitle: '收藏那些舍不得忘的瞬间', icon: entryIcon('submodule-icons-v2/home-memory.webp'), variant: 'edge' },
      { key: 'memorial', title: '纪念空间', subtitle: '给重要的喵留一盏灯', icon: entryIcon('submodule-icons-v2/home-memorial.webp'), variant: 'stage' }
    ]
  },
  {
    key: 'career', title: '职场喵', eyebrow: '职业身份与喵公司', subtitle: '职业 · 喵公司', color: 'orange', icon: pageAssets.moduleCareer,
    submodules: [
      { key: 'career-card', title: '职业盲盒', subtitle: '抽一张喵咪职业身份卡', icon: entryIcon('submodule-icons-v2/career-card.webp'), variant: 'split' },
      { key: 'company', title: '喵公司', subtitle: '让喵咪入职，开启新一天', icon: entryIcon('submodule-icons-v2/career-company.webp'), variant: 'stage' },
      { key: 'office-story', title: '职场喵剧场', subtitle: '看看今天办公室发生什么', icon: entryIcon('submodule-icons-v2/career-story.webp'), variant: 'poster' },
      { key: 'career-card-wall', title: '身份卡墙', subtitle: '收藏喵咪的职业履历', icon: entryIcon('submodule-icons-v2/career-wall.webp'), variant: 'edge' }
    ]
  }
];

// Render the editable Blender GLB through Three.js by default. The transparent
// character layers remain an initialization fallback only.
// Keep the Three.js/GLB path in the project for the later 3D phase, but use
// the approved flat design layers for the current homepage fidelity pass.
const ENABLE_3D_CAT_MODEL = false;

Page({
  data: {
    assets: pageAssets,
    screenState: 'home',
    stateClass: 'is-home',
    introPhase: 'approach',
    runFrame: 0,
    runFrameClass: 'run-frame--0',
    runStep: 0,
    runSequence: [0, 1, 2, 3, 3],
    runFrames: [
      asset('design-webp/cat-run-01.webp'),
      asset('design-webp/cat-run-02.webp'),
      asset('design-webp/cat-run-03.webp'),
      asset('design-webp/cat-run-04.webp')
    ],
    runFrameSrc: asset('design-webp/cat-run-01.webp'),
    blink: false,
    use3d: false,
    toastText: '',
    photoPath: '',
    touchStartY: 0,
    modules,
    menuView: 'modules',
    activeModule: null,
    activeSubmodules: []
  },

  onShow() {
    const preserveMenu = this.data.screenState === 'menu' && this.data.menuView === 'submodules' && this.data.activeModule;
    // Keep stale WebGL instances from covering the approved design layers.
    this.setData({ use3d: ENABLE_3D_CAT_MODEL });
    this.initCat3D();
    if (!this.introStarted) {
      this.startIntroSequence();
    } else {
      this.stopIdleMotion();
      this.setState(preserveMenu ? 'menu' : 'home');
      this.setData({ introPhase: preserveMenu ? 'menu' : 'ready', blink: false });
      this.startBlinkLoop();
    }
    const cats = getActiveCats(storage.getCats());
    if (!cats.length) return;
    const currentCatId = storage.getCurrentCatId() || cats[0].id;
    storage.setCurrentCatId(currentCatId);
  },

  onReady() {
    // The canvas node is available after the first WXML layout pass.
    setTimeout(() => this.initCat3D(), 0);
  },

  onHide() {
    this.stopIdleMotion();
    if (this.cat3d) this.cat3d.pause();
  },

  onUnload() {
    this.stopIdleMotion();
    if (this.cat3d) this.cat3d.dispose();
  },

  onEntryIconError(event) {
    const key = event.currentTarget.dataset.key;
    const kind = event.currentTarget.dataset.kind;
    if (!key) return;
    if (kind === 'module') {
      const modules = this.data.modules.map((item) => item.key === key ? { ...item, iconFailed: true } : item);
      this.setData({ modules });
      return;
    }
    const activeSubmodules = this.data.activeSubmodules.map((item) => item.key === key ? { ...item, iconFailed: true } : item);
    this.setData({ activeSubmodules });
  },

  initCat3D() {
    if (!ENABLE_3D_CAT_MODEL) return;
    const { makeCat3D } = require('../../utils/cat3d');
    if (this.cat3d || this.cat3dInitStarted) return;
    this.cat3dInitStarted = true;
    adapter.createSelectorQuery().in(this).select('#cat-webgl').node().exec((result) => {
      const canvas = result && result[0] && result[0].node;
      if (!canvas) {
        this.cat3dInitStarted = false;
        return;
      }
      try {
        const info = adapter.getSystemInfoSync();
        this.cat3d = makeCat3D(canvas, {
          width: canvas.width || info.windowWidth,
          height: canvas.height || info.windowHeight
        });
        this.setData({ use3d: true });
      } catch (error) {
        this.cat3dInitStarted = false;
        this.setData({ use3d: false });
        console.warn('言喵 3D 猫咪初始化失败，使用本地视觉兜底：', error);
      }
    });
  },

  stopIdleMotion() {
    clearTimeout(this.introTimer);
    clearTimeout(this.blinkOffTimer);
    clearInterval(this.blinkTimer);
    clearInterval(this.runFrameTimer);
    this.setData({ blink: false });
  },

  startIntroSequence() {
    this.introStarted = true;
    clearTimeout(this.introTimer);
    clearInterval(this.runFrameTimer);
    this.setData({ introPhase: 'approach', blink: false });
    this.setData({ runStep: 0, runFrame: 0, runFrameClass: 'run-frame--0', runFrameSrc: this.data.runFrames[0] });
    this.runFrameTimer = setInterval(() => {
      const nextStep = this.data.runStep + 1;
      if (nextStep < this.data.runSequence.length) {
        const nextFrame = this.data.runSequence[nextStep];
        this.setData({ runStep: nextStep, runFrame: nextFrame, runFrameClass: `run-frame--${nextFrame}`, runFrameSrc: this.data.runFrames[nextFrame] });
        return;
      }
      clearInterval(this.runFrameTimer);
      this.runFrameTimer = null;
      this.introTimer = setTimeout(() => {
        if (this.data.screenState !== 'home') return;
        this.setData({ introPhase: 'ready', runFrame: 0, runFrameClass: 'run-frame--0', runFrameSrc: this.data.runFrames[0] });
        this.startBlinkLoop();
      }, 220);
    }, 380);
  },

  startBlinkLoop() {
    clearInterval(this.blinkTimer);
    this.blinkTimer = setInterval(() => {
      const { screenState, introPhase } = this.data;
      if (screenState === 'home' && introPhase !== 'ready' && introPhase !== 'menu') return;
      if (screenState !== 'home' && screenState !== 'menu') {
        this.setData({ blink: false });
        return;
      }
      this.setData({ blink: true });
      clearTimeout(this.blinkOffTimer);
      this.blinkOffTimer = setTimeout(() => this.setData({ blink: false }), 280);
    }, 3600);
  },

  setState(screenState) {
    this.setData({ screenState, stateClass: `is-${screenState}` });
    if (this.cat3d) this.cat3d.setMode(screenState === 'touch' ? 'pet' : screenState === 'menu' ? 'menu' : 'idle', screenState === 'touch' ? 1050 : 500);
  },

  onCatTap() {
    if (this.data.screenState === 'menu') return;
      this.setData({ introPhase: 'ready', runStep: 0, runFrame: 0, runFrameClass: 'run-frame--0', runFrameSrc: this.data.runFrames[0], blink: false });
    this.openMenu();
    if (this.cat3d) this.cat3d.setMode('menu', 520);
  },

  onCatCanvasTap() {
    if (this.suppressCatTap) {
      this.suppressCatTap = false;
      return;
    }
    this.onCatTap();
  },

  onCatCanvasTouchStart(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    this.catDrag = { x: touch.clientX || touch.pageX, moved: false };
  },

  onCatCanvasTouchMove(event) {
    if (!this.catDrag || !this.cat3d) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const x = touch.clientX || touch.pageX;
    const delta = x - this.catDrag.x;
    if (Math.abs(delta) > 1) this.catDrag.moved = true;
    this.catDrag.x = x;
    this.cat3d.turnBy(delta, 0.014);
  },

  onCatCanvasTouchEnd() {
    if (this.catDrag && this.catDrag.moved) this.suppressCatTap = true;
    this.catDrag = null;
  },

  onTouchStart(event) {
    this.setData({ touchStartY: event.changedTouches[0].clientY });
  },

  onTouchEnd(event) {
    const distance = event.changedTouches[0].clientY - this.data.touchStartY;
    if (distance < -70) this.openMenu();
    if (distance > 70 && this.data.screenState === 'menu') this.closeMenu();
  },

  stopTap() {},

  openMenu() {
    clearTimeout(this.touchTimer);
    this.setState('menu');
    this.setData({ introPhase: 'menu', blink: false, menuView: 'modules', activeModule: null, activeSubmodules: [] });
    this.startBlinkLoop();
  },

  closeMenu() {
    this.setState('home');
    this.setData({ introPhase: 'ready', blink: false, menuView: 'modules', activeModule: null, activeSubmodules: [] });
    this.startBlinkLoop();
  },

  openModule(event) {
    const key = event.currentTarget.dataset.key;
    const activeModule = this.data.modules.find((item) => item.key === key);
    if (!activeModule) return;
    this.setData({ menuView: 'submodules', activeModule, activeSubmodules: activeModule.submodules });
  },

  backToModules() {
    this.setData({ menuView: 'modules', activeModule: null, activeSubmodules: [] });
  },

  showToast(text) {
    clearTimeout(this.toastTimer);
    this.setData({ toastText: text });
    this.toastTimer = setTimeout(() => this.setData({ toastText: '' }), 2200);
  },

  showVoice() {
    this.showToast('喵～今天也辛苦啦！');
  },

  openMine() {
    return adapter.navigateTo('/pages/mine/mine');
  },

  showChat() {
    const cats = getActiveCats(storage.getCats());
    if (!cats.length) {
      this.showToast('先创建喵档案，才能和喵聊天');
      return adapter.navigateTo('/pages/cat-edit/cat-edit');
    }
    const currentCatId = storage.getCurrentCatId() || cats[0].id;
    storage.setCurrentCatId(currentCatId);
    return adapter.navigateTo(`/subpackages/companion/chat/chat?catId=${encodeURIComponent(currentCatId)}`);
  },

  choosePhoto() { this.chooseAndCreate('camera'); },
  openWorks() { return adapter.navigateTo('/subpackages/creation/works/works'); },
  chooseFromAlbum() { return this.openWorks(); },
  async chooseAndCreate(source) {
    if(this.choosingPhoto)return;
    this.choosingPhoto=true;
    try {
      if (source === 'camera') return await adapter.navigateTo('/subpackages/creation/capture/capture?target=create');
      const path=await adapter.chooseImage([source]);
      storage.setPhotoDraft(path);
      await adapter.navigateTo('/subpackages/creation/create/create');
    }
    catch(error){if(!adapter.isCancel(error))adapter.showToast('未能读取照片，请检查相机或相册权限');}
    finally{this.choosingPhoto=false;}
  },
  closePhotoPreview() { this.setData({photoPath:''}); },
  startCreate() {storage.setPhotoDraft(this.data.photoPath);adapter.navigateTo('/subpackages/creation/create/create');this.setData({photoPath:''});},

  openShortVideo() {
    if (this.data.screenState === 'menu') this.closeMenu();
    return adapter.navigateTo('/subpackages/creation/special-create/special-create?type=gif&video=1');
  },

  openVideoPlayer() {
    if (this.data.screenState === 'menu') this.closeMenu();
    return adapter.navigateTo('/subpackages/creation/video-feed/video-feed', { animationType: 'none', animationDuration: 0 });
  },

  handleSubmodule(event) {
    const key = event.currentTarget.dataset.key;
    if (key === 'camera') return this.choosePhoto();
    if (key === 'video') return this.openShortVideo();
    if (key === 'chat') return this.showChat();
    if (key === 'cat-translator') {
      return adapter.navigateTo('/subpackages/companion/cat-translator/cat-translator');
    }
    if (key === 'calendar') {
      return adapter.navigateTo('/subpackages/companion/calendar/calendar');
    }
    if (key === 'trace-map') {
      return adapter.navigateTo('/subpackages/companion/trace-map/trace-map');
    }
    if (key === 'fortune') {
      return adapter.navigateTo('/subpackages/companion/fortune/fortune');
    }
    if (key === 'cyber-blessing') {
      return adapter.navigateTo('/subpackages/companion/cyber-blessing/cyber-blessing');
    }
    if (key === 'gif' || key === 'emoji') {
      return adapter.navigateTo(`/subpackages/creation/special-create/special-create?type=${key}`);
    }
    if (key === 'ai') {
      return adapter.navigateTo('/subpackages/creation/create/create');
    }
    if (key === 'works' || key === 'album' || key === 'memory') {
      return this.openWorks();
    }
    if (key === 'cats') {
      return adapter.navigateTo('/pages/cats/cats');
    }
    if (key === 'voice') return this.showVoice();
    if (key === 'seasons') {
      return adapter.navigateTo('/subpackages/creation/style-templates/style-templates');
    }
    if (key === 'career-card' || key === 'company' || key === 'office-story' || key === 'career-card-wall') {
      this.closeMenu();
      this.showToast('职场喵正在筹备中，很快就能上班啦');
      return;
    }
    this.closeMenu();
    this.showToast('这个入口正在准备中，先去逛逛其他喵功能吧');
  }
});
