const storage = require('../../../utils/storage');
const adapter = require('../../../utils/adapter');
const api = require('../../../services/api');
const { asset } = require('../../../utils/assets');
const { getActiveCats } = require('../../../utils/cat-archive');

function demoResult(catName = '这只喵') {
  return {
    mode: 'local-demo',
    title: '想靠近你',
    summary: `${catName}这段表现更像是在主动邀请互动：它愿意靠近，也在观察你的回应。`,
    signals: [
      { label: '动作', value: '身体放松，尾巴轻轻上扬' },
      { label: '声音', value: '短促、重复的叫声，情绪偏积极' },
      { label: '可能诉求', value: '想玩一会儿，或希望你回应它' }
    ],
    confidence: 82,
    suggestion: '可以先轻声回应，再把玩具放到它面前，观察它是否继续靠近。',
    disclaimer: '这是基于视频特征的趣味推测，不是医疗诊断，也不能替代兽医判断。'
  };
}

function demoAudioResult(catName = '这只喵') {
  return {
    mode: 'local-demo',
    title: '在叫你过去',
    summary: `${catName}这段叫声更像是在主动呼唤你，语气里有一点期待，也可能是在提醒你注意它。`,
    signals: [
      { label: '声音', value: '短促、连续的叫声，音量较稳定' },
      { label: '情绪', value: '偏积极，带有等待回应的感觉' },
      { label: '可能诉求', value: '想让你看它一眼，或陪它互动一会儿' }
    ],
    confidence: 76,
    suggestion: '先回应它的名字，再观察它接下来往哪里走，不要只根据叫声判断需求。',
    disclaimer: '这是基于声音特征的趣味推测，不是医疗诊断，也不能替代兽医判断。'
  };
}

function demoCatSpeech(text) {
  const clean = String(text || '').trim();
  return {
    mode: 'local-demo',
    text: `喵呜，${clean || '我想和你说说话'}${/[?？]$/.test(clean) ? '喵？' : '喵～'}`,
    meaning: '已把你的话改成更适合对喵表达的短句。',
    audioUrl: '',
    disclaimer: '当前播放的是演示喵声；真实猫咪不一定理解人类语言，请观察它的反应。'
  };
}

function isServerCatId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function currentServerCatId() {
  const cats = getActiveCats(storage.getCats());
  const catId = storage.getCurrentCatId() || cats[0]?.id || '';
  return isServerCatId(catId) ? catId : '';
}

Page({
  data: {
    videoPath: '',
    imagePath: '',
    videoDuration: 0,
    videoSize: 0,
    mediaKind: 'video',
    status: 'empty',
    error: '',
    result: null,
    direction: 'cat-to-human',
    audioPath: '',
    audioStatus: 'empty',
    audioError: '',
    audioResult: null,
    humanText: '',
    speechStatus: 'empty',
    speechError: '',
    speech: null,
    isPlaying: false,
    recordingHuman: false,
    catName: '',
    assets: {
      translator: asset('submodule-icons-v2/content-cat-translator.webp'),
      camera: asset('design-webp/ui/camera-icon-generated.webp'),
      album: asset('design-webp/ui/album-icon-generated.webp'),
      meowAudio: asset('cat-translator/meow-demo.wav')
    }
  },

  switchDirection(event) {
    const direction = event.currentTarget.dataset.direction === 'human-to-cat' ? 'human-to-cat' : event.currentTarget.dataset.direction === 'cat-audio' ? 'cat-audio' : 'cat-to-human';
    this.setData({ direction, error: '', audioError: '', speechError: '' });
  },

  onLoad() {
    const cats = getActiveCats(storage.getCats());
    const currentId = storage.getCurrentCatId() || cats[0]?.id;
    const currentCat = cats.find((cat) => cat.id === currentId) || cats[0];
    this.setData({ catName: currentCat?.name || '这只喵' });
  },

  async pickVideo(event) {
    if (this.data.status === 'analyzing') return;
    const source = event.currentTarget.dataset.source;
    try {
      const file = await adapter.chooseVideo({ sourceType: [source], maxDuration: 30 });
      if (!file.path) throw new Error('没有读取到视频');
      if (file.size > 50 * 1024 * 1024) throw new Error('视频不能超过 50MB，请选择较短的视频');
      this.setData({ mediaKind: 'video', videoPath: file.path, imagePath: '', videoDuration: Math.round(file.duration || 0), videoSize: file.size, status: 'ready', result: null, error: '' });
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ error: error.message || '视频读取失败，请重试' });
    }
  },

  async pickImage(event) {
    if (this.data.status === 'analyzing') return;
    const source = event.currentTarget.dataset.source;
    try {
      const imagePath = await adapter.chooseImage([source]);
      if (!imagePath) throw new Error('没有读取到照片');
      this.setData({ mediaKind: 'image', imagePath, videoPath: '', videoDuration: 0, videoSize: 0, status: 'ready', result: null, error: '' });
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ error: error.message || '照片读取失败，请重试' });
    }
  },

  switchMediaKind(event) {
    if (this.data.status === 'analyzing') return;
    const mediaKind = event.currentTarget.dataset.kind === 'image' ? 'image' : 'video';
    if (mediaKind === this.data.mediaKind) return;
    this.setData({ mediaKind, videoPath: '', imagePath: '', videoDuration: 0, videoSize: 0, status: 'empty', result: null, error: '' });
  },

  removeVideo() {
    if (this.data.status === 'analyzing') return;
    this.setData({ videoPath: '', imagePath: '', videoDuration: 0, videoSize: 0, status: 'empty', result: null, error: '' });
  },

  async analyze() {
    if ((!this.data.videoPath && !this.data.imagePath) || this.data.status === 'analyzing') return;
    this.setData({ status: 'analyzing', error: '', result: null });
    try {
      let result;
      if (api.isLoggedIn() && this.data.imagePath && typeof api.uploadImage === 'function' && typeof api.analyzeCatImage === 'function') {
        const assetId = await api.uploadImage(this.data.imagePath);
        const catId = currentServerCatId();
        const response = await api.analyzeCatImage({ assetId, ...(catId ? { catId } : {}) });
        result = response.result;
      } else if (api.isLoggedIn() && this.data.videoPath && typeof api.uploadVideo === 'function' && typeof api.analyzeCatVideo === 'function') {
        const assetId = await api.uploadVideo(this.data.videoPath);
        const catId = currentServerCatId();
        const response = await api.analyzeCatVideo({ assetId, ...(catId ? { catId } : {}) });
        result = response.result;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1400));
        result = demoResult(this.data.catName);
      }
      this.setData({ status: 'success', result });
    } catch (error) {
      this.setData({ status: 'error', error: error.message || '分析失败，请稍后重试' });
    }
  },

  async recordMeow() {
    if (this.data.audioStatus === 'analyzing') return;
    if (this.data.audioStatus === 'recording') return adapter.stopRecording();
    this.setData({ audioStatus: 'recording', audioError: '', audioResult: null });
    try {
      const audioPath = await adapter.recordAudio({ duration: 15, format: 'mp3' });
      if (!audioPath) throw new Error('没有录到喵声，请再试一次');
      this.setData({ audioPath, audioStatus: 'analyzing' });
      let result;
      if (api.isLoggedIn() && typeof api.uploadAudio === 'function' && typeof api.analyzeCatAudio === 'function') {
        const assetId = await api.uploadAudio(audioPath);
        const catId = currentServerCatId();
        result = (await api.analyzeCatAudio({ assetId, ...(catId ? { catId } : {}) })).result;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        result = demoAudioResult(this.data.catName);
      }
      this.setData({ audioStatus: 'success', audioResult: result });
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ audioStatus: 'error', audioError: error.message || '喵声分析失败，请重试' });
      else this.setData({ audioStatus: 'empty' });
    }
  },

  onHumanInput(event) {
    this.setData({ humanText: event.detail.value, speechError: '' });
  },

  async recordHuman() {
    if (this.data.recordingHuman) return adapter.stopRecording();
    if (!api.isLoggedIn() || typeof api.uploadAudio !== 'function' || typeof api.transcribeAudio !== 'function') {
      this.setData({ speechError: '演示模式请直接输入一句话；登录后可以按住说话。' });
      return;
    }
    this.setData({ recordingHuman: true, speechError: '' });
    try {
      const audioPath = await adapter.recordAudio({ duration: 15, format: 'mp3' });
      const assetId = await api.uploadAudio(audioPath);
      const result = await api.transcribeAudio(assetId);
      this.setData({ humanText: String(result.text || '').trim() });
    } catch (error) {
      if (!adapter.isCancel(error)) this.setData({ speechError: error.message || '语音识别失败，请重试' });
    } finally {
      this.setData({ recordingHuman: false });
    }
  },

  async createSpeech() {
    const text = String(this.data.humanText || '').trim();
    if (!text || this.data.speechStatus === 'creating') return;
    this.setData({ speechStatus: 'creating', speechError: '', speech: null });
    try {
      let speech;
      if (api.isLoggedIn() && typeof api.createCatSpeech === 'function') {
        const catId = currentServerCatId();
        speech = (await api.createCatSpeech({ text, ...(catId ? { catId } : {}) })).result;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 700));
        speech = demoCatSpeech(text);
      }
      this.setData({ speechStatus: 'success', speech });
    } catch (error) {
      this.setData({ speechStatus: 'error', speechError: error.message || '喵语生成失败，请重试' });
    }
  },

  toggleSpeech() {
    if (!this.data.speech) return;
    if (!this.audioContext) {
      this.audioContext = adapter.createInnerAudioContext();
      if (!this.audioContext) return this.setData({ speechError: '当前环境暂不支持音频播放' });
      this.audioContext.onEnded?.(() => this.setData({ isPlaying: false }));
      this.audioContext.onError?.(() => this.setData({ isPlaying: false, speechError: '喵声播放失败，请重试' }));
    }
    if (this.data.isPlaying) {
      this.audioContext.pause?.();
      this.setData({ isPlaying: false });
      return;
    }
    this.audioContext.src = this.data.speech.audioUrl || this.data.assets.meowAudio;
    this.audioContext.play?.();
    this.setData({ isPlaying: true });
  },

  retry() {
    this.analyze();
  },

  back() {
    adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index'));
  },

  onHide() {
    adapter.createVideoContext('translator-video')?.pause?.();
    this.audioContext?.pause?.();
    this.setData({ isPlaying: false });
  },

  onUnload() {
    adapter.createVideoContext('translator-video')?.pause?.();
    this.audioContext?.destroy?.();
    this.audioContext = null;
  }
});
