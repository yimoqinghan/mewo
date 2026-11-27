import { generatedText } from './text.js';

/**
 * 本地占位实现。用于没有 ARK_API_KEY 时把整条链路跑通：
 * 不产生费用、不返回图片 URL，worker 会把输入照片直接当作结果图，
 * 并附带一段模板文案。上线前务必把 AI_PROVIDER 切到 ark。
 */
export async function generateImage({ prompt, refImageUrls }) {
  if (!refImageUrls?.length) {
    throw new Error('mock 模式需要至少一张输入图片');
  }

  // 模拟推理耗时，让客户端能真实体验「等待 → 出图」的交互
  await new Promise((resolve) => setTimeout(resolve, 1200));

  return {
    imageUrls: [refImageUrls[0]],
    providerJobId: `mock-${Date.now()}`,
    usage: { mocked: true, promptLength: prompt.length },
    raw: { mocked: true }
  };
}

export { generatedText };
