import { query } from '../../db/pool.js';
import { ok } from '../../lib/errors.js';
import { config } from '../../config.js';
import { stickerRuntime } from '../../services/sticker/index.js';
import { getQuota } from '../../services/quota.js';
import { supportsMediaImage } from '../../services/ai/openai.js';
import { videoModelCatalog } from '../../services/ai/video.js';

/**
 * 元信息接口。小程序启动时拉一次，
 * 模板、额度、版本策略都从这里下发，避免把配置硬编码在客户端。
 */
export default async function metaRoutes(app) {
  app.get('/templates', async () => {
    const result = await query(
      `select key, name, category, description, config, credits_cost, min_cats, max_cats, sort_order
       from generation_template where enabled order by sort_order`
    );
    return ok({
      items: result.rows.map((row) => ({
        key: row.key,
        name: row.name,
        category: row.category,
        description: row.description,
        aspectRatio: row.config?.aspectRatio || '1:1',
        creditsCost: row.credits_cost,
        minCats: row.min_cats,
        maxCats: row.max_cats
      }))
    });
  });

  app.get('/config', async () => {
    return ok({
      brandName: '言喵',
      apiVersion: 'v1',
      features: {
        multiCat: true,
        persona: true,
        // 真实语音合成 / 支付尚未接入，客户端据此隐藏入口
        voice: false,
        payment: false,
        share: true,
        chat: Boolean(config.ai.chat.baseUrl && config.ai.chat.apiKey),
        specialGif: Boolean(
          (config.ai.provider === 'openai' && config.ai.openai.apiKey && supportsMediaImage(config.ai.openai.gifModel)) ||
          (config.ai.media.baseUrl && config.ai.media.apiKey && config.ai.media.gifModel)
        ),
        specialVideo: Boolean(config.ai.video.apiKey && config.ai.video.models.length),
        specialEmoji: config.ai.provider !== 'mock',
        petSticker: stickerRuntime().ready,
        wechatLogin: Boolean(config.wechat.appId && config.wechat.secret)
      },
      quota: {
        dailyFreeLimit: config.quota.imageDailyFreeLimit,
        imageDailyFreeLimit: config.quota.imageDailyFreeLimit,
        chatDailyFreeLimit: config.quota.chatDailyFreeLimit
      },
      imageModels:
        config.ai.provider === 'openai'
          ? config.ai.openai.imageModels.map(({ id, label }) => ({ id, label }))
          : [],
      videoModels: videoModelCatalog(),
      chatModels: config.ai.chat.models,
      assets: {
        maxUploadBytes: 10 * 1024 * 1024,
        acceptMime: ['image/jpeg', 'image/png', 'image/webp']
      }
    });
  });

  app.get('/quota', { preHandler: app.authenticate }, async (request) => {
    return ok({ quota: await getQuota(request.user.id) });
  });
}
