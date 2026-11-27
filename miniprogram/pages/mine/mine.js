const api = require('../../services/api');
const storage = require('../../utils/storage');
const adapter = require('../../utils/adapter');
const { asset } = require('../../utils/assets');

Page({
  data: {
    user: null,
    loggedIn: false,
    coinIcon: asset('welfare/cat-coin.webp'),
    welfare: { coins: 0, streak: 0, checkedIn: false },
    sections: [
      { title: '隐私与素材', desc: '照片、声音和家庭空间默认私密' },
      { title: '生成记录', desc: '查看你的创作与额度使用情况' },
      { title: '关于言喵', desc: '和猫一起，把日子过得可爱一点' }
    ]
  },

  onShow() {
    const welfare = storage.getWelfareState();
    const date = new Date();
    const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    this.setData({ user: storage.getUser(), loggedIn: api.isLoggedIn(), welfare: { coins: welfare.coins, streak: welfare.streak, checkedIn: welfare.lastCheckIn === today } });
  },

  login() { api.openLogin(); },

  openFeedback(event) {
    const type = event.currentTarget.dataset.type || 'feedback';
    adapter.navigateTo(`/pages/feedback/feedback?type=${type}`);
  },

  openWelfare() {
    adapter.navigateTo('/pages/welfare/welfare');
  },

  async logout() {
    try { await api.logout(); this.setData({ user: null, loggedIn: false }); adapter.showToast('已退出登录'); }
    catch (error) { adapter.showToast(error.message || '退出失败'); }
  }
});
