import { config } from '../../config.js';
import { fetchJson } from '../../lib/http.js';
import { errors } from '../../lib/errors.js';

const VIDEO_MIME = 'video/mp4';

function modelConfig(model) {
  return config.ai.video.models.find((item) => item.id === model) || null;
}

function mediaError(payload) {
  if (!payload) return '';
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.msg || payload.message || payload.detail || '';
}

function taskId(payload) {
  return payload?.data?.task_id
    || payload?.data?.taskId
    || payload?.data?.[0]?.task_id
    || payload?.data?.[0]?.taskId
    || payload?.task_id
    || payload?.taskId
    || payload?.id
    || null;
}

function firstVideoUrl(payload) {
  const sources = [
    payload,
    payload?.data,
    ...(Array.isArray(payload?.data) ? payload.data : []),
    payload?.result,
    payload?.output,
    payload?.content,
    payload?.data?.result
  ].filter(Boolean).flatMap((source) => Array.isArray(source) ? source : [source]);
  return sources.flatMap((source) => [
    source.video_url,
    source.result_url,
    source.output_url,
    source.download_url,
    source.url
  ]).find(Boolean) || null;
}

function successState(payload) {
  return String(
    payload?.state
      || payload?.status
      || payload?.data?.state
      || payload?.data?.status
      || payload?.result?.state
      || ''
  ).toLowerCase();
}

function result(payload, providerJobId) {
  const url = firstVideoUrl(payload);
  if (!url) return null;
  return {
    videoUrls: [url],
    contentType: VIDEO_MIME,
    providerJobId: providerJobId || taskId(payload),
    raw: payload
  };
}

function normalizeDuration(model, requestedDuration) {
  const requested = Number(requestedDuration || 3);
  const safeRequested = Number.isFinite(requested) ? Math.round(requested) : 3;
  if (!model?.minDuration) return { requested: safeRequested, effective: safeRequested };
  return {
    requested: safeRequested,
    effective: Math.min(model.maxDuration, Math.max(model.minDuration, safeRequested))
  };
}

async function pollMedia(task, modelId) {
  const baseUrl = config.ai.video.baseUrl.replace(/\/$/, '');
  const deadline = Date.now() + config.ai.video.timeoutMs;
  let delay = 5000;

  while (Date.now() < deadline) {
    const payload = await fetchJson(`${baseUrl}/media/status?task_id=${encodeURIComponent(task)}`, {
      headers: { authorization: `Bearer ${config.ai.video.apiKey}` },
      timeoutMs: 30000
    });
    const output = result(payload, task);
    if (output) return output;
    const state = successState(payload);
    if (payload?.is_final || ['failed', 'error', 'canceled', 'cancelled', 'expired'].includes(state)) {
      throw errors.upstream(mediaError(payload) || `${modelId} 视频生成失败`);
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(10000, delay + 1000);
  }
  throw errors.upstream('视频模型生成超时，请稍后重试');
}

async function pollSeedance(task) {
  const root = config.ai.video.baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const deadline = Date.now() + config.ai.video.timeoutMs;
  let delay = 5000;
  while (Date.now() < deadline) {
    const payload = await fetchJson(`${root}/api/v3/anmiao/contents/generations/tasks/${encodeURIComponent(task)}`, {
      headers: { authorization: `Bearer ${config.ai.video.apiKey}` },
      timeoutMs: 30000
    });
    const output = result(payload, task);
    if (output) return output;
    const state = successState(payload);
    if (['failed', 'error', 'canceled', 'cancelled', 'expired'].includes(state)) {
      throw errors.upstream(mediaError(payload) || 'SD 2.5 视频生成失败');
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(10000, delay + 1000);
  }
  throw errors.upstream('SD 2.5 视频生成超时，请稍后重试');
}

async function generateViaSeedance({ prompt, refImageUrls, duration, aspectRatio }) {
  const root = config.ai.video.baseUrl.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const content = [{ type: 'text', text: prompt }];
  if (refImageUrls?.[0]) {
    content.push({ type: 'image_url', role: 'reference_image', image_url: refImageUrls[0] });
  }
  const payload = await fetchJson(`${root}/api/v3/anmiao/contents/generations/tasks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.ai.video.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'doubao-seedance-2-5-260628',
      content,
      resolution: '480p',
      ratio: aspectRatio || '9:16',
      duration
    }),
    timeoutMs: 30000
  });
  const id = taskId(payload);
  const immediate = result(payload, id);
  if (immediate) return immediate;
  if (!id) throw errors.upstream('SD 2.5 未返回任务编号');
  return pollSeedance(id);
}

async function generateViaMedia({ model, prompt, refImageUrls, refVideoUrls, duration, aspectRatio }) {
  const modelInfo = modelConfig(model);
  const params = {
    aspect_ratio: aspectRatio || '9:16',
    resolution: '768P'
  };

  if (modelInfo?.capability === 'enhance') {
    params.video_url = refVideoUrls?.[0];
    params.resolution = '1080p';
    params.fps = 'keep';
    params.tool_version = 'standard';
    params.scene = 'aigc';
    params.enhance_style = 'natural';
  } else {
    params.duration = String(duration);
    if (modelInfo?.id === 'minimax-h3') {
      params.mode = 'cankaosheng';
      params.image_url = refImageUrls || [];
    } else {
      params.images = refImageUrls || [];
    }
  }

  const baseUrl = config.ai.video.baseUrl.replace(/\/$/, '');
  const payload = await fetchJson(`${baseUrl}/media/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.ai.video.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model, prompt, params }),
    timeoutMs: 30000
  });
  if (payload.code && String(payload.code) !== '200') {
    throw errors.upstream(mediaError(payload) || `${model} 拒绝了视频请求`, { code: payload.code });
  }
  const id = taskId(payload);
  const immediate = result(payload, id);
  if (immediate) return immediate;
  if (!id) throw errors.upstream(`${model} 未返回任务编号`);
  return pollMedia(id, model);
}

export function videoModelCatalog() {
  return config.ai.video.models.map(({ id, label, protocol, capability, requiresVideoInput, minDuration, maxDuration, supportsImageReference }) => ({
    id,
    label,
    protocol,
    capability: capability || 'generate',
    requiresVideoInput: Boolean(requiresVideoInput),
    minDuration: minDuration || null,
    maxDuration: maxDuration || null,
    supportsImageReference: Boolean(supportsImageReference)
  }));
}

export async function generateVideo({ prompt, refImageUrls, refVideoUrls, model, duration = 3, aspectRatio = '9:16' }) {
  if (!config.ai.video.apiKey) throw errors.unsupported('未配置视频模型 API Key');
  const selectedModel = model || config.ai.video.defaultModel;
  const modelInfo = modelConfig(selectedModel);
  if (!modelInfo) throw errors.badRequest('视频模型不可用');
  if (modelInfo.requiresVideoInput && !refVideoUrls?.length) {
    throw Object.assign(new Error('视频超分需要上传一段视频'), { code: 'VIDEO_INPUT_REQUIRED' });
  }
  if (modelInfo.supportsImageReference && !refImageUrls?.length) {
    throw Object.assign(new Error('视频生成需要一张猫咪参考照片'), { code: 'INPUT_MISSING' });
  }
  const normalized = normalizeDuration(modelInfo, duration);
  const finalPrompt = `${prompt}\n\n输出要求：竖屏 9:16，保持猫咪脸部、花色与身体结构稳定，不出现水印、乱码、危险动作或多余人物。`;
  const output = modelInfo.protocol === 'seedance'
    ? await generateViaSeedance({ prompt: finalPrompt, refImageUrls, duration: normalized.effective, aspectRatio })
    : await generateViaMedia({ model: selectedModel, prompt: finalPrompt, refImageUrls, refVideoUrls, duration: normalized.effective, aspectRatio });
  return { ...output, requestedDuration: normalized.requested, effectiveDuration: normalized.effective };
}
