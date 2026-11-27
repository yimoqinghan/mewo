import { config } from '../../config.js';
import { fetchJson } from '../../lib/http.js';
import { errors } from '../../lib/errors.js';

/**
 * 火山方舟生图（Seedream）。
 * 契约与 OpenAI images 接口接近，但多图参考用 image 字段，
 * 具体字段以方舟文档为准，模型 ID 通过环境变量替换，不写死在代码里。
 */
export async function generateImage({ prompt, negativePrompt, refImageUrls, size, seed }) {
  if (!config.ai.ark.apiKey) {
    throw errors.unsupported('未配置 ARK_API_KEY');
  }

  const body = {
    model: config.ai.ark.imageModel,
    prompt: negativePrompt ? `${prompt}\n\n不要出现：${negativePrompt}` : prompt,
    response_format: 'url',
    size: size || '2048x2048',
    watermark: false,
    // 单图生成，避免一次任务产出多张导致成本失控
    sequential_image_generation: 'disabled'
  };

  if (refImageUrls?.length === 1) body.image = refImageUrls[0];
  if (refImageUrls?.length > 1) body.image = refImageUrls;
  if (seed !== undefined && seed !== null) body.seed = seed;

  const json = await fetchJson(`${config.ai.ark.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.ai.ark.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body),
    timeoutMs: config.ai.timeoutMs
  });

  const urls = (json.data || []).map((item) => item.url).filter(Boolean);
  if (!urls.length) {
    throw errors.upstream('方舟未返回图片地址', { id: json.id });
  }

  return {
    imageUrls: urls,
    providerJobId: json.id || null,
    usage: json.usage || null,
    raw: json
  };
}
