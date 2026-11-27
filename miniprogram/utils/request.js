const adapter = require('./adapter');
const env = require('../config/env');

const TOKEN_KEY = 'ym_access_token';
const REFRESH_KEY = 'ym_refresh_token';

let accessToken = adapter.storageGet(TOKEN_KEY, '');
let refreshToken = adapter.storageGet(REFRESH_KEY, '');
let refreshing = null;

function setTokens(tokens) {
  accessToken = tokens.accessToken || '';
  refreshToken = tokens.refreshToken || '';
  adapter.storageSet(TOKEN_KEY, accessToken);
  adapter.storageSet(REFRESH_KEY, refreshToken);
}

function clearTokens() {
  accessToken = '';
  refreshToken = '';
  adapter.storageRemove(TOKEN_KEY);
  adapter.storageRemove(REFRESH_KEY);
}

function hasSession() {
  return Boolean(accessToken);
}

/** 把服务端的错误结构转成带 code 的 Error，方便页面分支处理 */
const VALIDATION_FIELD_LABELS = {
  '/options/model': '生图模型',
  '/options/prompt': '画面描述',
  '/options/professionalPrompt': '专业补充要求',
  '/options/aspectRatio': '画幅比例',
  '/options/skillId': '创作风格',
  '/options/skillPrompt': '风格要求',
  '/options/negativePrompt': '不希望出现的内容'
};

function validationReason(details) {
  const item = Array.isArray(details) ? details[0] : null;
  if (!item) return '';
  const field = VALIDATION_FIELD_LABELS[item.field] || item.field || '请求参数';
  if (item.rule === 'required') return `缺少${field}`;
  if (item.rule === 'minLength') return `${field}不能为空`;
  if (item.rule === 'maxLength') return `${field}过长`;
  if (item.rule === 'format') return `${field}格式不正确`;
  if (item.rule === 'type') return `${field}类型不正确`;
  return `${field}校验失败`;
}

function toError(body, statusCode) {
  const serverMessage = body?.error?.message || '网络异常，请稍后重试';
  const reason = body?.error?.code === 'VALIDATION_FAILED' ? validationReason(body.error.details) : '';
  const message = reason && !serverMessage.includes(reason) ? `${serverMessage}：${reason}` : serverMessage;
  const error = new Error(message);
  error.code = body?.error?.code || 'NETWORK_ERROR';
  error.statusCode = statusCode;
  error.details = body?.error?.details;
  return error;
}

function rawRequest({ path, method = 'GET', data, needAuth = true }) {
  return adapter
    .request({
      url: `${env.apiBaseUrl}${path}`,
      method,
      data,
      header: {
        'content-type': 'application/json',
        'x-client': adapter.clientTag,
        ...(needAuth && accessToken ? { authorization: `Bearer ${accessToken}` } : {})
      }
    })
    .then((res) => ({ statusCode: res.statusCode, body: res.data }))
    .catch((error) => {
      const failure = new Error(error?.errMsg || '网络连接失败');
      failure.code = 'NETWORK_ERROR';
      throw failure;
    });
}

/**
 * 统一请求入口。
 * 401 时用 refresh token 换一次新令牌并重试，避免用户每次冷启动都被踢下线。
 */
async function request(options) {
  let response = await rawRequest(options);

  if (response.statusCode === 401 && options.needAuth !== false && refreshToken) {
    const renewed = await refreshSession();
    if (renewed) {
      response = await rawRequest(options);
    }
  }

  if (response.statusCode >= 200 && response.statusCode < 300 && response.body?.ok) {
    return response.body.data;
  }

  if (response.statusCode === 401) {
    clearTokens();
  }

  throw toError(response.body, response.statusCode);
}

/** 刷新令牌。并发调用时共享同一个 Promise，避免同一 refresh token 被用两次 */
function refreshSession() {
  if (refreshing) return refreshing;

  refreshing = rawRequest({
    path: '/v1/auth/refresh',
    method: 'POST',
    data: { refreshToken },
    needAuth: false
  })
    .then(({ statusCode, body }) => {
      if (statusCode !== 200 || !body?.ok) {
        clearTokens();
        return false;
      }
      setTokens(body.data);
      return true;
    })
    .catch(() => {
      clearTokens();
      return false;
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

module.exports = {
  request,
  setTokens,
  clearTokens,
  hasSession,
  refreshSession,
  getRefreshToken: () => refreshToken,
  getAccessToken: () => accessToken
};
