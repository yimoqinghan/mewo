import { config } from '../config.js';
import { fetchJson } from '../lib/http.js';
import { errors } from '../lib/errors.js';

const CODE2SESSION = 'https://developer.toutiao.com/api/apps/v2/jscode2session';

/**
 * 抖音小程序登录。tt.login 拿到 code 后服务端换取 openid。
 * 抖音的 unionid 需要开放平台主体绑定后才返回，未绑定时为 null。
 */
export async function code2Session(code) {
  if (!config.douyin.appId || !config.douyin.secret) {
    throw errors.unsupported('未配置抖音小程序 AppID / Secret');
  }

  const json = await fetchJson(CODE2SESSION, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      appid: config.douyin.appId,
      secret: config.douyin.secret,
      code,
      anonymous_code: ''
    }),
    timeoutMs: 8000
  });

  if (json.err_no !== 0 || !json.data) {
    throw errors.badRequest(`抖音登录失败：${json.err_tips || json.err_no}`);
  }

  const { openid, anonymous_openid: anonymousOpenid, unionid, session_key: sessionKey } = json.data;

  // 未登录用户只有 anonymous_openid，不能作为账号主体
  if (!openid) {
    throw errors.badRequest('抖音未返回 openid，请引导用户完成授权');
  }

  return {
    openid,
    anonymousOpenid: anonymousOpenid || null,
    unionid: unionid || null,
    sessionKey: sessionKey || null
  };
}
