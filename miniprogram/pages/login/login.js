const api = require('../../services/api');
const adapter = require('../../utils/adapter');
const { asset } = require('../../utils/assets');
Page({
  data: { agreed: false, busy: false, error: '', configured: true, assets: { cloudSoft: asset('design-webp/cloud-soft.webp'), homeCat: asset('design-webp/cat-home.webp') } },
  onLoad() {
    api.getConfig().then(config => this.setData({ configured: config.features.wechatLogin !== false })).catch(() => {});
  },
  toggleAgreement() { if(!this.data.busy)this.setData({ agreed: !this.data.agreed }); },
  async login() {
    if(this.data.busy)return;
    if(!this.data.agreed)return this.setData({error:'请先阅读并同意下方账号与隐私说明'});
    if(!this.data.configured)return this.setData({error:'微信登录服务尚在配置中，请稍后重试'});
    this.setData({busy:true,error:''});
    try {
      await api.login();
      await api.syncCats();
      adapter.showToast('登录成功，资料已同步','success');
      await adapter.navigateBack().catch(()=>adapter.reLaunch('/pages/index/index'));
    }catch(error){this.setData({error:error.message||error.errMsg||'登录失败，请重试'});}
    finally{this.setData({busy:false});}
  },
  back(){adapter.navigateBack().catch(()=>adapter.reLaunch('/pages/index/index'));}
});
