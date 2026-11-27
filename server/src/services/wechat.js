import { config } from '../config.js';
import { fetchBuffer, fetchJson } from '../lib/http.js';
import { errors } from '../lib/errors.js';

const BASE = 'https://api.weixin.qq.com';

/**
 * 生成不限量微信小程序码。scene 只放短分享码，真正的档案数据由扫码后的公开接口读取。
 */
export async function getWxaCodeUnlimit({ scene, page = 'pages/cat-profile/cat-profile' }) {
  if (!config.wechat.appId || !config.wechat.secret) {
    throw errors.unsupported('未配置微信小程序 AppID / Secret，暂时无法生成可扫码喵卡片');
  }
  if (!/^[\w\-]{1,32}$/.test(scene || '')) throw errors.badRequest('分享码格式不正确');

  const token = await getAccessToken();
  const { buffer, contentType } = await fetchBuffer(
    `${BASE}/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        scene,
        page,
        check_path: false,
        env_version: config.wechat.envVersion,
        width: 360,
        auto_color: false,
        line_color: { r: 61, g: 42, b: 114 },
        is_hyaline: false
      }),
      timeoutMs: 15000,
      maxBytes: 2 * 1024 * 1024
    }
  );

  if (contentType.includes('json') || buffer[0] === 123) {
    let json = {};
    try { json = JSON.parse(buffer.toString('utf8')); } catch { /* fall through */ }
    throw errors.badRequest(`微信小程序码生成失败：${json.errmsg || '返回内容无效'}`, { errcode: json.errcode });
  }
  return { buffer, contentType: contentType || 'image/png' };
}

/**
 * 小程序登录：用 wx.login 拿到的 code 换 openid / unionid / session_key。
 * 注意 code 只能使用一次，且 5 分钟内有效，不能缓存复用。
 */
export async function code2Session(code) {
  if (!config.wechat.appId || !config.wechat.secret) {
    throw errors.unsupported('未配置微信小程序 AppID / Secret');
  }
  const url =
    `${BASE}/sns/jscode2session?appid=${config.wechat.appId}` +
    `&secret=${config.wechat.secret}&js_code=${encodeURIComponent(code)}` +
    '&grant_type=authorization_code';

  const json = await fetchJson(url, { timeoutMs: 8000 });
  if (json.errcode) {
    throw errors.badRequest(`微信登录失败：${json.errmsg}`, { errcode: json.errcode });
  }
  if (!json.openid) {
    throw errors.upstream('微信未返回 openid');
  }
  return {
    openid: json.openid,
    unionid: json.unionid || null,
    sessionKey: json.session_key || null
  };
}

let cachedToken = { value: '', expiresAt: 0 };

/**
 * 服务端接口调用凭证。微信限制每日获取次数，必须缓存。
 * 2C2G 单实例场景内存缓存足够；多实例部署时需要换成共享缓存。
 */
export async function getAccessToken(force = false) {
  if (!force && cachedToken.value && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }
  const url =
    `${BASE}/cgi-bin/token?grant_type=client_credential` +
    `&appid=${config.wechat.appId}&secret=${config.wechat.secret}`;

  const json = await fetchJson(url, { timeoutMs: 8000 });
  if (!json.access_token) {
    throw errors.upstream(`获取微信 access_token 失败：${json.errmsg || '未知错误'}`);
  }
  // 提前 5 分钟过期，避免边界失效
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 7200) * 1000 - 5 * 60 * 1000
  };
  return cachedToken.value;
}

/**
 * 新版手机号获取：button open-type="getPhoneNumber" 返回 code，
 * 服务端换真实号码。用于微信 / 抖音小程序之间的账号合并。
 */
export async function getPhoneByCode(code) {
  if(!config.wechat.appId || !config.wechat.secret)throw errors.unsupported('微信登录服务尚未配置');
  const token = await getAccessToken();
  const json = await fetchJson(`${BASE}/wxa/business/getuserphonenumber?access_token=${token}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    timeoutMs: 8000
  });
  if (json.errcode !== 0) {
    // 40001/42001 通常是 access_token 失效，重试一次
    if ([40001, 42001].includes(json.errcode)) {
      const retried = await getAccessToken(true);
      const retryJson = await fetchJson(
        `${BASE}/wxa/business/getuserphonenumber?access_token=${retried}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code }),
          timeoutMs: 8000
        }
      );
      if (retryJson.errcode === 0) {
        return normalizePhone(retryJson.phone_info);
      }
    }
    throw errors.badRequest(`获取手机号失败：${json.errmsg}`, { errcode: json.errcode });
  }
  return normalizePhone(json.phone_info);
}

function normalizePhone(info) {
  if (!info) throw errors.upstream('微信未返回手机号信息');
  if(String(info.countryCode || '86')!=='86' || !/^1[3-9]\d{9}$/.test(info.purePhoneNumber || info.phoneNumber || ''))throw errors.badRequest('当前仅支持中国大陆手机号');
  // 号码经过微信验证，统一存储为国内 11 位号码。
  return {
    phone: info.purePhoneNumber || info.phoneNumber,
    countryCode: info.countryCode || '86'
  };
}

/** 微信小程序内容安全：图片审核，生成/上传后调用 */
export async function checkImageSec(buffer, contentType = 'image/jpeg') {
  const token = await getAccessToken();
  const form = new FormData();
  form.append('media', new Blob([buffer], { type: contentType }), 'image.jpg');
  const json = await fetchJson(
    `${BASE}/wxa/img_sec_check?access_token=${token}&media_format=${encodeURIComponent(contentType)}`,
    { method: 'POST', body: form, timeoutMs:15000 }
  );
  if (json.errcode !== 0) {
    throw errors.upstream(`图片审核失败：${json.errmsg}`);
  }
  return { pass: json.result?.suggest === 'pass', raw: json };
}
