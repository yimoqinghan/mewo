import { config } from '../../config.js';
import * as ark from './ark.js';
import * as openai from './openai.js';
import * as video from './video.js';
import * as mock from './mock.js';
import { errors } from '../../lib/errors.js';

/**
 * AI 供应商适配层。上层（worker）只依赖这个接口，
 * 换供应商时不需要改业务代码。
 *
 * 当前支持：
 *   mock  —— 本地占位，跑通链路
 *   ark   —— 火山方舟 Seedream
 *   openai —— OpenAI Images API（GPT Image）
 */
export function getProvider() {
  switch (config.ai.provider) {
    case 'ark':
      return { name: 'ark', generateImage: ark.generateImage, generateVideo: video.generateVideo };
    case 'openai':
      return { name: 'openai', generateImage: openai.generateImage, generateVideo: video.generateVideo };
    case 'mock':
      return { name: 'mock', generateImage: mock.generateImage, generateVideo: video.generateVideo };
    default:
      throw new Error(`未知的 AI_PROVIDER：${config.ai.provider}`);
  }
}

export { generatedText } from './text.js';
export { buildPrompt } from './prompt.js';

export async function transcribeAudio(args) {
  if (config.ai.provider !== 'openai') throw errors.unsupported('当前 AI 服务未配置语音转文字');
  return openai.transcribeAudio(args);
}
