const adapter = require('../../utils/adapter');
const storage = require('../../utils/storage');
const { asset } = require('../../utils/assets');

const CHECK_IN_REWARD = 20;
const REFERRAL_REWARD = 30;
const TASKS = [
  { id: 'create', title: '开启一次创作', desc: '拍一张猫咪照片，留下今天的灵感', reward: 30, action: '去创作' },
  { id: 'feedback', title: '参与一次共创', desc: '提交一个问题或脑洞，帮言喵变更好', reward: 20, action: '去共创' }
];

function getDateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

Page({
  data: {
    coins: 0,
    coinIcon: asset('welfare/cat-coin.webp'),
    totalEarned: 0,
    streak: 0,
    todayEarned: 0,
    checkedIn: false,
    checkInReward: CHECK_IN_REWARD,
    referralReward: REFERRAL_REWARD,
    checkInDays: [],
    tasks: TASKS,
    transactions: []
  },

  onLoad(options) {
    this.referralCode = String(options.ref || '').trim();
    adapter.showShareMenu().catch(() => {});
    adapter.setNavigationBarColor({ frontColor: '#20243C', backgroundColor: '#B8D7FF' }).catch(() => {});
    this.loadWelfare();
    this.claimReferralReward(this.referralCode);
  },

  onShow() {
    this.loadWelfare();
  },

  loadWelfare() {
    const state = storage.getWelfareState();
    const today = getDateKey();
    const claimedToday = Array.isArray(state.claimedTasks[today]) ? state.claimedTasks[today] : [];
    const checkedIn = state.lastCheckIn === today;
    const todayEarned = state.transactions
      .filter(item => getDateKey(new Date(item.createdAt)) === today)
      .reduce((total, item) => total + (Number(item.amount) || 0), 0);
    const checkInDays = Array.from({ length: 7 }, (_, index) => ({
      label: `第${index + 1}天`,
      active: state.streak > index,
      current: checkedIn && state.streak === index + 1
    }));
    const tasks = TASKS.map(item => ({ ...item, claimed: claimedToday.includes(item.id) }));
    const transactions = state.transactions.slice(0, 4).map(item => ({ ...item, timeText: formatTime(item.createdAt) }));
    this.setData({ coins: state.coins, totalEarned: state.totalEarned, streak: state.streak, todayEarned, checkedIn, checkInDays, tasks, transactions });
  },

  claimReferralReward(referralCode) {
    if (!referralCode) return;
    try {
      const result = storage.claimWelfareReferral(referralCode, REFERRAL_REWARD);
      if (result.claimed) {
        this.loadWelfare();
        adapter.showToast(`好友分享奖励 +${result.reward} 喵币`, 'success');
      }
    } catch (error) {
      adapter.showToast(error.message || '分享奖励领取失败，请稍后重试');
    }
  },

  onShareAppMessage() {
    let referralCode = '';
    try { referralCode = storage.getWelfareShareCode(); } catch (error) { /* 由微信继续使用默认分享卡片 */ }
    return {
      title: `来言喵领 ${REFERRAL_REWARD} 喵币`,
      path: `/pages/welfare/welfare?ref=${encodeURIComponent(referralCode)}`,
      imageUrl: this.data.coinIcon
    };
  },

  onShareTimeline() {
    let referralCode = '';
    try { referralCode = storage.getWelfareShareCode(); } catch (error) { /* 使用无邀请参数的默认分享 */ }
    return {
      title: `来言喵领 ${REFERRAL_REWARD} 喵币`,
      query: `ref=${encodeURIComponent(referralCode)}`,
      imageUrl: this.data.coinIcon
    };
  },

  claimCheckIn() {
    if (this.data.checkedIn) {
      adapter.showToast('今天已经签到啦');
      return;
    }
    try {
      const result = storage.claimWelfareCheckIn();
      if (!result.claimed) return adapter.showToast('今天已经签到啦');
      this.loadWelfare();
      adapter.showToast(`签到成功，获得 ${result.reward} 喵币`);
    } catch (error) {
      adapter.showToast(error.message || '签到失败，请稍后重试');
    }
  },

  startTask(event) {
    const taskId = event.currentTarget.dataset.task;
    const task = TASKS.find(item => item.id === taskId);
    const current = this.data.tasks.find(item => item.id === taskId);
    if (!task || current?.claimed) {
      adapter.showToast('今天已经完成啦');
      return;
    }
    const url = taskId === 'feedback' ? '/pages/feedback/feedback?type=suggestion' : '/subpackages/creation/capture/capture?target=welfare';
    adapter.navigateTo(url).catch(() => adapter.showToast('入口暂时不可用，请稍后重试'));
  },

  goBack() {
    adapter.navigateBack().catch(() => adapter.reLaunch('/pages/mine/mine'));
  }
});
