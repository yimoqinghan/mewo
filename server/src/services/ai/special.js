import { config } from '../../config.js';
import { fetchJson } from '../../lib/http.js';
import { errors } from '../../lib/errors.js';
import { getProvider } from './index.js';
import { normalizeMediaType } from '../media-format.js';

function firstUrl(payload) {
  return payload.url
    || payload.video_url
    || payload.output_url
    || payload.data?.[0]?.url
    || payload.data?.[0]?.video_url
    || payload.result?.url
    || payload.result?.video_url
    || null;
}

function taskId(payload) {
  return payload?.data?.task_id
    || payload?.data?.taskId
    || payload?.data?.[0]?.task_id
    || payload?.data?.[0]?.taskId
    || payload?.data?.task_ids?.[0]
    || payload?.task_id
    || payload?.taskId
    || payload?.id
    || null;
}

function outputFrom(payload, requestedType = 'image/gif') {
  const url = firstUrl(payload);
  if (url) {
    const declaredType = normalizeMediaType(payload.content_type || payload.mime || payload.data?.[0]?.content_type);
    const contentType = payload.video_url ? 'video/mp4' : (requestedType || declaredType || 'image/gif');
    return { imageUrls: [url], contentType, providerJobId: payload.id || null };
  }
  const base64 = payload.b64_json || payload.data?.[0]?.b64_json;
  if (base64) return { imageBase64: base64, contentType: requestedType || normalizeMediaType(payload.content_type || payload.mime) || 'image/png', providerJobId: payload.id || null };
  return null;
}

async function pollMedia(id) {
  const endpoint = `${config.ai.media.baseUrl.replace(/\/$/, '')}${config.ai.media.gifStatusPath}/${id}`;
  const deadline = Date.now() + config.ai.media.timeoutMs;
  let delay = 1500;
  while (Date.now() < deadline) {
    const payload = await fetchJson(endpoint, {
      headers: { authorization: `Bearer ${config.ai.media.apiKey}` },
      timeoutMs: 30000
    });
    const output = outputFrom(payload);
    if (output) return output;
    if (['failed', 'canceled', 'expired'].includes(payload.status)) {
      throw errors.upstream(payload.error?.message || 'GIF 模型生成失败');
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay + 500, 4000);
  }
  throw errors.upstream('GIF 模型生成超时，请稍后重试');
}

/** 表情和 GIF 都是真实模型生成；表情文字必须作为生成约束传给模型。 */
export async function generateSpecial({ type, prompt, refImageUrls, skillPrompt, text, mediaMode = 'static' }) {
  const expressionText = String(text || '').trim() || (type === 'emoji' ? '好耶！' : '');
  const textInstruction = expressionText
    ? `必须在画面中清晰、完整、可读地添加中文文字「${expressionText}」，文字是表情表达的核心，不能缺失、乱码、被猫咪主体遮挡。`
    : '';

  if (type === 'emoji') {
    const provider = getProvider();
    if (provider.name === 'mock') throw errors.unsupported('表情模型尚未配置，请先配置真实生图服务');
    return provider.generateImage({
      prompt: `${prompt}\n\n输出要求：透明或干净背景，主体完整，适合聊天表情；${skillPrompt || ''}\n${textInstruction}`,
      negativePrompt: '水印、乱码、边框、重复主体、过度复杂背景',
      refImageUrls,
      size: '1024x1024',
      outputFormat: mediaMode === 'animated' ? 'gif' : 'png',
      frameCount: 6,
      frameDurationMs: 200
    });
  }

  // 已配置独立 GIF 服务时优先走它，避免 GIF 被普通图片模型抢走。
  if (config.ai.media.baseUrl && config.ai.media.apiKey && config.ai.media.gifModel) {
    const endpoint = `${config.ai.media.baseUrl.replace(/\/$/, '')}${config.ai.media.gifPath}`;
    const payload = await fetchJson(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.ai.media.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: config.ai.media.gifModel,
        prompt: `${prompt}\n\n动效表达：${skillPrompt || ''}\n${textInstruction}\n输出 2 秒、循环自然、主体外观稳定的 GIF。`,
        image: refImageUrls?.[0] || undefined,
        duration: 2,
        fps: 12,
        output_format: 'gif'
      }),
      timeoutMs: config.ai.media.timeoutMs
    });

    const immediate = outputFrom(payload);
    if (immediate) {
      if (immediate.contentType !== 'image/gif') throw errors.unsupported('GIF 模型返回的不是 GIF 文件，请检查上游输出格式');
      return immediate;
    }
    const providerTaskId = taskId(payload);
    if (providerTaskId) {
      const result = await pollMedia(providerTaskId);
      if (result.contentType !== 'image/gif') throw errors.unsupported('GIF 模型返回的不是 GIF 文件，请检查上游输出格式');
      return result;
    }
    throw errors.upstream('GIF 模型未返回任务编号或可用结果');
  }

  // 当前灵泉 tt-image-2.6 的媒体协议支持真实 GIF 输出，不再使用 CSS 摇摆或静态图假装动效。
  const imageProvider = getProvider();
  if (imageProvider.name === 'openai') {
    return imageProvider.generateImage({
      prompt: `${prompt}\n\n动效表达：${skillPrompt || ''}\n${textInstruction}\n输出 6 帧、每帧 200ms、循环自然、主体外观稳定的 GIF。`,
      negativePrompt: '水印、乱码、重复主体、过度复杂背景、明显跳帧',
      refImageUrls,
      size: '1024x1024',
      model: config.ai.openai.gifModel,
      outputFormat: 'gif',
      frameCount: 6,
      frameDurationMs: 200
    });
  }

  throw errors.unsupported('GIF 模型服务尚未配置，请先配置 MEDIA_BASE_URL、MEDIA_API_KEY 和 MEDIA_GIF_MODEL');
}
