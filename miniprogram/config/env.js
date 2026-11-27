/**
 * 手机预览与发布默认走自建 HTTPS API + COS。
 * dev 仍保留微信云开发作为回退联调环境，切换 CURRENT 即可切换链路。
 */
const CURRENT = 'prod';
const CLOUD_ENV_ID = 'yanmiao-dev-d0grqyxj0cc290a96';
const ENVS = {
  dev: {
    apiBaseUrl: 'http://127.0.0.1:3000',
    assetBaseUrl: 'http://127.0.0.1:3000',
    staticAssetBaseUrl: '',
    cloudEnvId: CLOUD_ENV_ID,
    useRemote: false,
    useCloud: true
  },
  prod: {
    apiBaseUrl: 'https://api.missmeow.net',
    assetBaseUrl: 'https://api.missmeow.net',
    staticAssetBaseUrl: 'https://static.missmeow.net/static',
    cloudEnvId: CLOUD_ENV_ID,
    useRemote: true,
    useCloud: false
  }
};
module.exports = { ...ENVS[CURRENT], env: CURRENT };
