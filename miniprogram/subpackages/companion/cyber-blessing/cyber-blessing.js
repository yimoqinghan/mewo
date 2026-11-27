const adapter = require('../../../utils/adapter');
const storage = require('../../../utils/storage');
const { asset } = require('../../../utils/assets');

const INCENSE_COST = 5;
const KNOCK_INTERVAL = 1800;
const KNOCK_IMPACT_DELAY = 960;
let activeKnockPage = null;
let lastImpactAt = 0;
const BLESSINGS = [
  { title: '今天有光', text: '喵喵替你把心意放在香火旁，先把眼前的一件小事做好，日子会慢慢亮起来。', good: '整理桌面 · 回复一条消息', avoid: '把所有事一次做完' },
  { title: '慢慢来喵', text: '今天适合留一点空白。小喵已经替你敲着木鱼，你不用一直冲刺，休息也是在给好事腾位置。', good: '散步十分钟 · 喝水补能量', avoid: '因为着急否定自己' },
  { title: '好事靠近', text: '喵喵把一份轻松送到你身边。有个小小的好消息正在路上，先做喜欢的事就好。', good: '记录灵感 · 分享猫片', avoid: '反复刷新等结果' },
  { title: '稳稳接住', text: '今天的关键词是“稳”。让小喵替你守一会儿，把步子放慢一点，你会更有把握。', good: '拆开任务 · 提前收尾', avoid: '同时开启太多新计划' },
  { title: '喵喵加油', text: '你已经做得很好啦。小喵敲响这一声，是提醒你给自己一个小奖励，再走下一步。', good: '完成一件小事 · 早点休息', avoid: '拿自己和别人比较' }
];

const pageAssets = {
  cat: asset('design-webp/ui/cyber-blessing/cat-praying-generated.webp'),
  catLoop: asset('design-webp/ui/cyber-blessing/cat-praying-loop-v2.webp'),
  woodFishAudio: asset('design-webp/ui/cyber-blessing/wood-fish-hit-v2.wav'),
  temple: asset('design-webp/ui/cyber-blessing/temple-night-generated.png'),
  coin: asset('welfare/cat-coin.webp')
};

function getDateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function makeTransaction(amount) {
  return {
    id: `coin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: '喵喵上香祈福',
    source: 'cyber-blessing',
    amount,
    createdAt: Date.now()
  };
}

function pickBlessing(today, totalBlessings) {
  const seed = String(today).split('').reduce((sum, char) => sum + char.charCodeAt(0), totalBlessings * 7);
  return BLESSINGS[seed % BLESSINGS.length];
}

Page({
  data: {
    assets: pageAssets,
    status: 'idle',
    coins: 0,
    woodFishCount: 0,
    incenseCost: INCENSE_COST,
    incenseStep: 0,
    knockAnimationReady: false,
    knockRewardVisible: false,
    blessing: null
  },

  onLoad() {
    if (activeKnockPage && activeKnockPage !== this) activeKnockPage.stopAutoKnock();
    activeKnockPage = this;
    adapter.setNavigationBarColor({ frontColor: '#FFF7E4', backgroundColor: '#27335C' }).catch(() => {});
    this.prepareWoodFishAudio();
    this.loadState();
  },

  onShow() {
    this.loadState();
    if (this.pageReady) this.restartKnockClock();
  },

  onReady() {
    this.pageReady = true;
    this.restartKnockClock();
  },

  onHide() {
    this.knockClockVersion = Number(this.knockClockVersion || 0) + 1;
    this.stopAutoKnock();
    if (this.pageReady) this.setData({ knockAnimationReady: false, knockRewardVisible: false });
  },

  loadState() {
    const today = getDateKey();
    const saved = storage.getCyberBlessingState();
    const state = saved.date === today ? saved : { ...saved, date: today, woodFishCount: 0, blessing: null };
    const welfare = storage.getWelfareState();
    this.today = today;
    this.cyberState = state;
    this.setData({
      coins: welfare.coins,
      woodFishCount: state.woodFishCount,
      blessing: state.blessing,
      status: state.blessing ? 'result' : 'idle',
      incenseStep: state.blessing ? 3 : 0,
      knockRewardVisible: false
    });
    if (saved.date !== today) storage.saveCyberBlessingState(state);
  },

  restartKnockClock() {
    const clockVersion = Number(this.knockClockVersion || 0) + 1;
    this.knockClockVersion = clockVersion;
    this.stopAutoKnock();
    activeKnockPage = this;
    this.setData({ knockAnimationReady: false, knockRewardVisible: false }, () => {
      if (this.knockClockVersion !== clockVersion || !this.pageReady) return;
      this.setData({ knockAnimationReady: true }, () => {
        if (this.knockClockVersion === clockVersion) this.startAutoKnock(clockVersion);
      });
    });
  },

  startAutoKnock(clockVersion = this.knockClockVersion) {
    if (activeKnockPage !== this || this.knockRunning || !this.today || !this.cyberState || this.knockClockVersion !== clockVersion) return;
    this.knockRunning = true;
    this.knockStartedAt = Date.now();
    this.autoKnock(clockVersion);
    this.knockTimer = setInterval(() => {
      if (this.knockClockVersion !== clockVersion) {
        this.stopAutoKnock();
        return;
      }
      this.autoKnock(clockVersion);
    }, KNOCK_INTERVAL);
  },

  stopAutoKnock() {
    clearInterval(this.knockTimer);
    this.knockTimer = null;
    clearTimeout(this.impactTimer);
    clearTimeout(this.knockRewardTimer);
    this.knockStartedAt = null;
    this.knockRunning = false;
    this.knockBusy = false;
    if (activeKnockPage === this) activeKnockPage = null;
  },

  autoKnock(clockVersion = this.knockClockVersion) {
    if (!this.today || !this.cyberState || this.knockBusy || this.knockClockVersion !== clockVersion) return;
    this.knockBusy = true;
    this.setData({ knockRewardVisible: false });
    this.impactTimer = setTimeout(() => {
      this.impactTimer = null;
      if (this.knockClockVersion !== clockVersion) return;
      const impactAt = Date.now();
      if (impactAt - lastImpactAt < KNOCK_INTERVAL - 120) {
        this.knockBusy = false;
        return;
      }
      lastImpactAt = impactAt;
      const result = storage.claimCyberBlessingKnock(this.today, impactAt, KNOCK_INTERVAL - 120);
      if (!result.claimed) {
        this.knockBusy = false;
        return;
      }
      const nextState = result.state;
      const nextCount = nextState.woodFishCount;
      this.cyberState = nextState;
      storage.saveCyberBlessingState(nextState);
      this.setData({ woodFishCount: nextCount, knockRewardVisible: true });
      this.playWoodFishSound();
      this.knockRewardTimer = setTimeout(() => this.setData({ knockRewardVisible: false }), 420);
      this.knockBusy = false;
    }, KNOCK_IMPACT_DELAY);
  },

  prepareWoodFishAudio() {
    if (this.woodFishAudio) return this.woodFishAudio;
    this.woodFishAudio = adapter.createInnerAudioContext();
    if (!this.woodFishAudio) return null;
    this.woodFishAudio.volume = 0.58;
    this.woodFishAudio.obeyMuteSwitch = false;
    this.woodFishAudio.src = this.data.assets.woodFishAudio;
    this.woodFishAudio.onError?.(() => {});
    return this.woodFishAudio;
  },

  playWoodFishSound() {
    const audio = this.prepareWoodFishAudio();
    if (!audio) return;
    audio.stop?.();
    audio.seek?.(0);
    audio.play?.();
  },

  async startIncense() {
    if (this.data.status === 'burning') return;
    if (this.data.blessing) {
      this.setData({ status: 'result' });
      adapter.showToast('今天已经替你上香啦');
      return;
    }
    const welfare = storage.getWelfareState();
    if (welfare.coins < INCENSE_COST) {
      const modal = await adapter.showModal({
        title: '喵币还差一点',
        content: `让小喵上香祈福需要 ${INCENSE_COST} 喵币，去每日福利攒一点吧。`,
        confirmText: '去攒喵币',
        cancelText: '先陪喵一会儿'
      }).catch(() => ({ confirm: false }));
      if (modal?.confirm) adapter.navigateTo('/pages/welfare/welfare').catch(() => {});
      return;
    }

    const totalBlessings = Number(this.cyberState?.totalBlessings || 0) + 1;
    const nextWelfare = {
      ...welfare,
      coins: welfare.coins - INCENSE_COST,
      transactions: [makeTransaction(-INCENSE_COST), ...welfare.transactions].slice(0, 30)
    };
    const blessing = pickBlessing(this.today || getDateKey(), totalBlessings);
    const nextCyberState = {
      ...(this.cyberState || storage.getCyberBlessingState()),
      date: this.today || getDateKey(),
      blessing,
      totalBlessings
    };
    storage.saveWelfareState(nextWelfare);
    storage.saveCyberBlessingState(nextCyberState);
    this.cyberState = nextCyberState;
    this.clearIncenseTimers();
    this.setData({ status: 'burning', incenseStep: 0, blessing: null, coins: nextWelfare.coins });
    this.incenseTimers = [
      setTimeout(() => this.setData({ incenseStep: 1 }), 680),
      setTimeout(() => this.setData({ incenseStep: 2 }), 1420),
      setTimeout(() => this.setData({ incenseStep: 3, status: 'result', blessing }), 2460)
    ];
  },

  clearIncenseTimers() {
    (this.incenseTimers || []).forEach(timer => clearTimeout(timer));
    this.incenseTimers = [];
  },

  goWelfare() {
    adapter.navigateTo('/pages/welfare/welfare').catch(() => adapter.showToast('福利入口暂时不可用，请稍后重试'));
  },

  goBack() {
    adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index'));
  },

  onShareAppMessage() {
    return { title: '来言喵，让小喵替你敲一声木鱼', path: '/pages/index/index' };
  },

  onUnload() {
    this.stopAutoKnock();
    this.clearIncenseTimers();
    this.woodFishAudio?.destroy?.();
    this.woodFishAudio = null;
  }
});
