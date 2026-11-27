/**
 * 统一错误类型。所有可预期错误都抛 AppError，
 * 由错误处理器转成 { ok: false, error: { code, message, details } }。
 * code 是给客户端做分支判断的稳定标识，message 只面向用户展示。
 */
export class AppError extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errors = {
  unauthorized: (message = '登录状态已失效，请重新登录') =>
    new AppError('UNAUTHORIZED', message, 401),

  forbidden: (message = '没有权限操作该资源') => new AppError('FORBIDDEN', message, 403),

  notFound: (message = '资源不存在') => new AppError('NOT_FOUND', message, 404),

  badRequest: (message = '请求参数不合法', details) =>
    new AppError('BAD_REQUEST', message, 400, details),

  conflict: (message = '资源状态冲突', details) =>
    new AppError('CONFLICT', message, 409, details),

  quotaExceeded: (message = '今日免费生成次数已用完') =>
    new AppError('QUOTA_EXCEEDED', message, 429),

  tooManyRequests: (message = '请求过于频繁，请稍后再试') =>
    new AppError('RATE_LIMITED', message, 429),

  unsupported: (message = '该能力尚未开放') => new AppError('UNSUPPORTED', message, 400),

  upstream: (message = '上游服务暂时不可用，请稍后重试', details) =>
    new AppError('UPSTREAM_ERROR', message, 502, details),

  internal: (message = '服务异常，请稍后重试') => new AppError('INTERNAL_ERROR', message, 500)
};

export const ok = (data) => ({ ok: true, data });
