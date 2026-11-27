const adapter = require('../../../utils/adapter');
const api = require('../../../services/api');
const { asset } = require('../../../utils/assets');
const { getSpecialSkills } = require('../../../services/special-creations');

function normalizeVideo(item, source = 'work') {
  return {
    id: `${source}-${item.id || item.name}`,
    title: item.title || item.name || '喵视频',
    desc: item.body || item.desc || '和猫一起，把日子过得可爱一点。',
    // 线上视频优先使用 HLS，弱网下播放器只拉当前 ts；下载/分享继续使用 media.url。
    url: item.media?.hlsUrl || item.stream || item.media?.url || item.cover?.url || item.url || item.example || '',
    downloadUrl: item.media?.downloadUrl || item.media?.url || item.cover?.url || item.example || item.url || '',
    // HLS 首帧还未到达时也要有可见画面，避免视频页在路由切换期间露出黑屏。
    poster: item.poster || item.cover?.poster || asset('design-webp/cat-home.webp'),
    liked: false,
    source,
    catName: (item.cats || []).map((cat) => cat.name).join('、') || '言喵示例'
  };
}

Page({
  data: {
    videos: [],
    currentIndex: 0,
    isPlaying: true,
    loading: true,
    error: '',
    notice: '',
    startWorkId: '',
    assets: {
      menuCat: asset('design-webp/cat-menu-perched.webp'),
      like: asset('video-icons/heart-outline.svg'),
      liked: asset('video-icons/heart-filled.svg'),
      download: asset('video-icons/download.svg'),
      share: asset('video-icons/share.svg')
    }
  },

  onLoad(options) {
    this.pageAlive = true;
    adapter.showShareMenu().catch(() => {});
    adapter.setNavigationBarColor({ frontColor: '#ffffff', backgroundColor: '#11131e' }).catch(() => {});
    this.setData({ startWorkId: options?.workId || '' });
    this.loadVideos();
  },

  onShareAppMessage() {
    const item = this.data.videos[this.data.currentIndex];
    const workId = item?.source === 'work' ? String(item.id).replace(/^work-/, '') : '';
    return {
      title: item ? `${item.title}｜和喵一起刷短片` : '喵视频｜和喵一起刷短片',
      path: `/subpackages/creation/video-feed/video-feed${workId ? `?workId=${encodeURIComponent(workId)}` : ''}`,
      imageUrl: item?.poster || this.data.assets.menuCat
    };
  },

  onShareTimeline() {
    const item = this.data.videos[this.data.currentIndex];
    const workId = item?.source === 'work' ? String(item.id).replace(/^work-/, '') : '';
    return {
      title: item ? `${item.title}｜和喵一起刷短片` : '喵视频｜和喵一起刷短片',
      query: workId ? `workId=${encodeURIComponent(workId)}` : '',
      imageUrl: item?.poster || this.data.assets.menuCat
    };
  },

  showNotice(message) {
    clearTimeout(this.noticeTimer);
    this.setData({ notice: message || '' });
    if (message) {
      this.noticeTimer = setTimeout(() => {
        if (this.pageAlive) this.setData({ notice: '' });
      }, 2400);
    }
  },

  updateProgress(index, field, value) {
    if (!this.pageAlive || !Number.isInteger(index)) return;
    const progress = Math.max(0, Math.min(99, Math.round(Number(value) || 0)));
    this.setData({ [`videos[${index}].${field}`]: progress });
  },

  async loadVideos() {
    const examples = getSpecialSkills('gif', 'short-video')
      .filter((item) => item.example)
      .map((item) => normalizeVideo(item, 'example'));
    let works = [];
    if (api.isLoggedIn()) {
      try {
        const result = await api.listWorks({ saved: false, limit: 20 });
        works = (result.items || [])
          .filter((item) => item.outputMime === 'video/mp4' && (item.media?.hlsUrl || item.media?.url || item.cover?.url))
          .map((item) => normalizeVideo(item, 'work'));
      } catch {
        // 示例视频仍可播放，网络失败不阻塞沉浸播放器。
      }
    }
    const ordered = this.data.startWorkId
      ? [...works.filter((item) => item.id === `work-${this.data.startWorkId}`), ...works.filter((item) => item.id !== `work-${this.data.startWorkId}`), ...examples]
      : [...works, ...examples];
    const videos = ordered.filter((item, index, list) => item.url && list.findIndex((candidate) => candidate.url === item.url) === index);
    this.setData({ videos, loading: false, currentIndex: 0, isPlaying: true, error: videos.length ? '' : '暂时还没有可播放的喵视频' }, () => this.playCurrent());
  },

  playCurrent() {
    const current = adapter.createVideoContext(`video-${this.data.currentIndex}`);
    current?.play?.();
    this.setData({ isPlaying: true });
  },

  stopVideo(index) {
    const video = adapter.createVideoContext(`video-${index}`);
    video?.pause?.();
  },

  onSwiperChange(event) {
    const next = Number(event.detail.current) || 0;
    this.stopVideo(this.data.currentIndex);
    this.setData({ currentIndex: next, isPlaying: true, error: '' }, () => this.playCurrent());
  },

  togglePlay() {
    const current = adapter.createVideoContext(`video-${this.data.currentIndex}`);
    if (!current) return;
    if (this.data.isPlaying) {
      current.pause?.();
      this.setData({ isPlaying: false });
    } else {
      current.play?.();
      this.setData({ isPlaying: true });
    }
  },

  toggleLike(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.videos[index]) return;
    const liked = !this.data.videos[index].liked;
    const videos = this.data.videos.map((item, itemIndex) => itemIndex === index ? { ...item, liked, likeAnimating: liked } : item);
    this.setData({ videos });
    clearTimeout(this.likeTimer);
    if (liked) {
      this.likeTimer = setTimeout(() => {
        const nextVideos = this.data.videos.map((item, itemIndex) => itemIndex === index ? { ...item, likeAnimating: false } : item);
        this.setData({ videos: nextVideos });
      }, 720);
    }
  },

  onVideoError() {
    this.setData({ error: '这条视频暂时无法播放，可以上滑继续看下一条。' });
  },

  async downloadCurrent() {
    const index = this.data.currentIndex;
    const item = this.data.videos[index];
    if (!item?.downloadUrl) return this.showNotice('这条视频暂时没有可下载文件。');
    if (item.downloading || item.sharing) return;
    this.setData({ [`videos[${index}].downloading`]: true, [`videos[${index}].downloadProgress`]: 0 });
    try {
      const path = await adapter.downloadFile(item.downloadUrl, {
        extension: 'mp4',
        onProgressUpdate: (event) => this.updateProgress(index, 'downloadProgress', event.progress)
      });
      this.updateProgress(index, 'downloadProgress', 99);
      await adapter.saveVideoToAlbum(path);
      this.updateProgress(index, 'downloadProgress', 100);
      this.showNotice('视频已保存到相册，可以发给朋友啦～');
      adapter.showToast('已保存到手机相册', 'success');
    } catch (error) {
      this.showNotice(error.message || '保存视频失败，请检查相册权限。');
    } finally {
      this.setData({ [`videos[${index}].downloading`]: false, [`videos[${index}].downloadProgress`]: 0 });
    }
  },

  async shareCurrent() {
    const index = this.data.currentIndex;
    const item = this.data.videos[index];
    if (!item?.downloadUrl) return this.showNotice('这条视频暂时没有可分享文件。');
    if (item.downloading || item.sharing) return;
    if (!adapter.canShareVideo()) return this.showNotice('当前环境暂不支持直接分享，请先保存视频再发送。');
    this.setData({ [`videos[${index}].sharing`]: true, [`videos[${index}].shareProgress`]: 0 });
    try {
      const path = await adapter.downloadFile(item.downloadUrl, {
        extension: 'mp4',
        onProgressUpdate: (event) => this.updateProgress(index, 'shareProgress', event.progress)
      });
      this.updateProgress(index, 'shareProgress', 99);
      await adapter.shareVideo(path);
      this.updateProgress(index, 'shareProgress', 100);
      this.showNotice('分享面板已打开，选个朋友发出去吧～');
      adapter.showToast('已打开分享菜单');
    } catch (error) {
      this.showNotice(error.message || '分享视频失败，请稍后重试。');
    } finally {
      this.setData({ [`videos[${index}].sharing`]: false, [`videos[${index}].shareProgress`]: 0 });
    }
  },

  back() {
    this.stopVideo(this.data.currentIndex);
    adapter.navigateBack({ animationType: 'none', animationDuration: 0 }).catch(() => adapter.reLaunch('/pages/index/index'));
  },

  onHide() { this.stopVideo(this.data.currentIndex); },
  onUnload() {
    this.pageAlive = false;
    clearTimeout(this.likeTimer);
    clearTimeout(this.noticeTimer);
    this.stopVideo(this.data.currentIndex);
    adapter.setNavigationBarColor({ frontColor: '#000000', backgroundColor: '#f8f7fb' }).catch(() => {});
  }
});
