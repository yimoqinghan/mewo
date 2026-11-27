const env = require('./config/env');
const adapter = require('./utils/adapter');

App({
  globalData: { brandName: '言喵', slogan: '和猫一起，把日子过得可爱一点。', currentCatId: '', cloudEnabled: false },
  onLaunch() {
    const cloudEnabled = Boolean(env.useCloud && adapter.initCloud(env.cloudEnvId));
    this.globalData.cloudEnabled = cloudEnabled;
  }
});
