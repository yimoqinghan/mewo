import { config } from '../../config.js';
import { fetchBuffer, fetchJson } from '../../lib/http.js';
import { errors } from '../../lib/errors.js';

function mediaHost(baseUrl) {
  try {
    const hostname = new URL(baseUrl).hostname;
    return hostname === 'api.lk888.ai' || hostname.endsWith('.lk888.ai') || hostname === 'api.lk666.ai' || hostname.endsWith('.lk666.ai');
  } catch {
    return false;
  }
}

export function supportsMediaImage(model = config.ai.openai.imageModel) {
  if (config.ai.openai.imageProtocol === 'media') return true;
  if (config.ai.openai.imageProtocol === 'openai') return false;
  return mediaHost(config.ai.openai.baseUrl) && Boolean(model);
}

function aspectRatioFromSize(size) {
  if (size === '1536x1024') return '3:2';
  if (size === '1024x1536') return '2:3';
  return '1:1';
}

function contentTypeFor(format = 'png') {
  return format === 'gif' ? 'image/gif' : format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
}

export function mediaOutput(payload, providerJobId, requestedFormat = 'png') {
  const sources = [
    payload,
    payload?.data,
    ...(Array.isArray(payload?.data) ? payload.data : []),
    payload?.result,
    payload?.output,
    payload?.data?.result
  ].filter(Boolean);
  const urls = sources.flatMap((source) => [
    source.result_url,
    source.output_url,
    source.video_url,
    source.download_url,
    source.url,
    ...(Array.isArray(source.result_urls) ? source.result_urls : [])
  ]).filter(Boolean);
  if (urls.length) {
    return {
      imageUrls: [urls[0]],
      contentType: contentTypeFor(requestedFormat),
      providerJobId: providerJobId || payload?.id || payload?.task_id || null,
      raw: { taskId: providerJobId || payload?.task_id || null }
    };
  }
  const base64 = sources.map((source) => source.b64_json || source.base64).find(Boolean);
  if (base64) {
    return {
      imageBase64: base64,
      contentType: contentTypeFor(requestedFormat),
      providerJobId: providerJobId || payload?.id || null,
      raw: { taskId: providerJobId || null }
    };
  }
  return null;
}

function mediaError(payload) {
  if (!payload) return '';
  if (typeof payload.error === 'string') return payload.error;
  return payload.error?.message || payload.msg || payload.message || '';
}

export function mediaTaskId(payload) {
  return payload?.data?.task_id
    || payload?.data?.taskId
    || payload?.data?.[0]?.task_id
    || payload?.data?.[0]?.taskId
    || payload?.task_id
    || payload?.taskId
    || payload?.id
    || null;
}

async function pollMediaTask(taskId, requestedFormat) {
  const baseUrl = config.ai.openai.baseUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/media/status?task_id=${encodeURIComponent(taskId)}`;
  const deadline = Date.now() + config.ai.timeoutMs;
  let delay = 1200;
  while (Date.now() < deadline) {
    const payload = await fetchJson(endpoint, {
      headers: { authorization: `Bearer ${config.ai.openai.apiKey}` },
      timeoutMs: 30000
    });
    const result = mediaOutput(payload, taskId, requestedFormat);
    if (result) return result;
    const state = String(
      payload.state
      || payload.status
      || payload.data?.state
      || payload.data?.status
      || payload.data?.[0]?.state
      || payload.data?.[0]?.status
      || ''
    ).toLowerCase();
    if (payload.is_final || ['failed', 'error', 'canceled', 'cancelled', 'expired'].includes(state)) {
      throw errors.upstream(mediaError(payload) || '图片模型生成失败');
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 400, 3500);
  }
  throw errors.upstream('图片模型生成超时，请稍后重试');
}

async function generateImageViaMedia({ prompt, refImageUrls, size, model, outputFormat = 'png', frameCount, frameDurationMs }) {
  const baseUrl = config.ai.openai.baseUrl.replace(/\/$/, '');
  const params = {
    aspect_ratio: aspectRatioFromSize(size),
    resolution: size === 'auto' ? 'auto' : '1K',
    quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(config.ai.openai.quality) ? config.ai.openai.quality : 'auto',
    output_format: outputFormat
  };
  if (outputFormat === 'gif') {
    params.frame_count = Number(frameCount || 6);
    params.frame_duration_ms = Number(frameDurationMs || 200);
  }
  const body = { model, prompt, params };
  if (refImageUrls?.length) body.images = refImageUrls;
  const payload = await fetchJson(`${baseUrl}/media/generate`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.ai.openai.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body),
    timeoutMs: config.ai.timeoutMs
  });
  if (payload.code && String(payload.code) !== '200') {
    throw errors.upstream(mediaError(payload) || '图片模型拒绝了生成请求', { code: payload.code });
  }
  const taskId = mediaTaskId(payload) || payload.data?.task_ids?.[0];
  const immediate = mediaOutput(payload, taskId, outputFormat);
  if (immediate) return immediate;
  if (!taskId) throw errors.upstream('图片模型未返回任务编号');
  return pollMediaTask(taskId, outputFormat);
}

/**
 * 图片模型适配层。
 *
 * 标准 OpenAI 服务走 /images/*；灵泉兼容服务走 /media/generate，
 * 统一支持参考图、PNG 和真实 GIF 输出。最终文件仍由 worker 转入私有对象存储。
 */
export async function generateImage({ prompt, negativePrompt, refImageUrls, size, model, outputFormat = 'png', frameCount, frameDurationMs }) {
  if (!config.ai.openai.apiKey) {
    throw errors.unsupported('未配置 OPENAI_API_KEY');
  }

  const selectedModel = model || config.ai.openai.imageModel;
  if (!config.ai.openai.imageModels.some((item) => item.id === selectedModel)) {
    throw errors.badRequest('生图模型不可用');
  }

  const finalPrompt = negativePrompt
    ? `${prompt}\n\n不要出现：${negativePrompt}`
    : prompt;
  if (supportsMediaImage(selectedModel)) {
    return generateImageViaMedia({
      prompt: finalPrompt,
      refImageUrls,
      size,
      model: selectedModel,
      outputFormat,
      frameCount,
      frameDurationMs
    });
  }
  const outputSize = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']).has(size)
    ? size
    : '1024x1024';
  const endpoint = refImageUrls?.length
    ? `${config.ai.openai.baseUrl}/images/edits`
    : `${config.ai.openai.baseUrl}/images/generations`;

  let json;
  if (refImageUrls?.length) {
    const input = await fetchBuffer(refImageUrls[0], {
      timeoutMs: 30000,
      maxBytes: 10 * 1024 * 1024
    });
    const form = new FormData();
    form.append('model', selectedModel);
    form.append('prompt', finalPrompt);
    form.append('size', outputSize);
    form.append('quality', config.ai.openai.quality);
    form.append(
      'image',
      new Blob([input.buffer], { type: input.contentType || 'image/jpeg' }),
      'pet-reference.jpg'
    );
    json = await fetchJson(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.ai.openai.apiKey}` },
      body: form,
      timeoutMs: config.ai.timeoutMs
    });
  } else {
    json = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.ai.openai.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        prompt: finalPrompt,
        size: outputSize,
        quality: config.ai.openai.quality
      }),
      timeoutMs: config.ai.timeoutMs
    });
  }

  const item = json.data?.[0];
  if (!item) throw errors.upstream('OpenAI 未返回图片结果', { id: json.id });
  if (item.b64_json) {
    return {
      imageBase64: item.b64_json,
      contentType: 'image/png',
      providerJobId: json.id || null,
      usage: json.usage || null,
      raw: { id: json.id || null }
    };
  }
  if (item.url) {
    return {
      imageUrls: [item.url],
      providerJobId: json.id || null,
      usage: json.usage || null,
      raw: { id: json.id || null }
    };
  }
  throw errors.upstream('OpenAI 未返回可用图片数据', { id: json.id });
}

export async function transcribeAudio({ buffer, mime = 'audio/mpeg' }) {
  if (!config.ai.openai.apiKey) throw errors.unsupported('未配置 OPENAI_API_KEY');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `voice.${mime === 'audio/mp4' ? 'm4a' : mime === 'audio/wav' || mime === 'audio/x-wav' ? 'wav' : 'mp3'}`);
  form.append('model', config.ai.openai.transcribeModel);
  form.append('response_format', 'json');
  const json = await fetchJson(`${config.ai.openai.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.ai.openai.apiKey}` },
    body: form,
    timeoutMs: config.ai.timeoutMs
  });
  const text = String(json.text || '').trim();
  if (!text) throw errors.upstream('语音识别没有返回文字');
  return { text };
}
