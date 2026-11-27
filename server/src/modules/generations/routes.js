import { query, withTransaction } from '../../db/pool.js';
import { ok, errors, AppError } from '../../lib/errors.js';
import { config } from '../../config.js';
import { requireQuota, getQuota, refundQuota } from '../../services/quota.js';
import { stickerRuntime } from '../../services/sticker/index.js';
import { resolveAssetUrls, resolveVideoAssetRefs } from '../../services/assets.js';

/**
 * 生成任务。客户端只负责创建任务和轮询，不等待长连接。
 * 图片生成 10~30 秒，小程序 wx.request 超时不可靠，
 * 所以这里必须是「提交 → 拿 jobId → 轮询」三段式。
 */
export default async function generationRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['templateKey'],
          properties: {
            requestKey: { type: 'string', minLength: 8, maxLength: 128 },
            templateKey: { type: 'string', minLength: 1, maxLength: 64 },
            catIds: {
              type: 'array',
              minItems: 0,
              maxItems: 4,
              items: { type: 'string', format: 'uuid' }
            },
            assetIds: {
              type: 'array',
              maxItems: 4,
              items: { type: 'string', format: 'uuid' }
            },
            options: {
              type: 'object',
              properties: {
                mood: { type: 'string', maxLength: 64 },
                text: { type: 'string', maxLength: 200 },
                size: { type: 'string', maxLength: 16 },
                prompt: { type: 'string', maxLength: 1000 },
                professionalPrompt: { type: 'string', maxLength: 1000 },
                aspectRatio: { type: 'string', maxLength: 8 },
                skillId: { type: 'string', maxLength: 64 },
                skillPrompt: { type: 'string', maxLength: 300 },
                mediaMode: { type: 'string', enum: ['static', 'animated'] },
                negativePrompt: { type: 'string', maxLength: 300 },
                seed: { type: 'integer' },
                model: { type: 'string', maxLength: 128 },
                duration: { type: 'integer', minimum: 1, maximum: 30 }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const { templateKey, catIds = [], assetIds = [], options = {}, requestKey }  = request.body;

      if (options.model) {
        const validImageModel = config.ai.provider === 'openai' && config.ai.openai.imageModels.some((item) => item.id === options.model);
        const validVideoModel = templateKey === 'special-video' && config.ai.video.models.some((item) => item.id === options.model);
        if (!validImageModel && !validVideoModel) throw errors.badRequest(templateKey === 'special-video' ? '视频模型不可用' : '生图模型不可用');
      }

      if (templateKey === 'pet-sticker') {
        if (!requestKey) throw errors.badRequest('缺少提交标识');
        if (assetIds.length !== 1) throw new AppError('INPUT_MISSING', '请选择一张宠物照片');
        if (!stickerRuntime().ready) throw new AppError('STICKER_UNAVAILABLE', '贴纸服务正在准备，请稍后再试', 503);
      }
      // 1. 模板校验
      const template = await query(
        'select * from generation_template where key = $1 and enabled',
        [templateKey]
      );
      if (!template.rows.length) throw errors.notFound('模板不存在或已下线');
      const tpl = template.rows[0];
      const allowsNoCats = ['ai-image', 'special-gif', 'special-emoji', 'special-video'].includes(templateKey);

      if (!allowsNoCats && !catIds.length) throw errors.badRequest('该创作需要至少选择一只猫咪');
      if (['special-gif', 'special-emoji'].includes(templateKey) && assetIds.length !== 1) {
        throw errors.badRequest('GIF 或表情创作需要一张猫咪参考照片');
      }
      if (templateKey === 'special-video' && assetIds.length !== 1) {
        throw errors.badRequest('短视频创作需要一张猫咪参考照片');
      }

      if (catIds.length < tpl.min_cats || catIds.length > tpl.max_cats) {
        throw errors.badRequest(`该模板支持 ${tpl.min_cats}~${tpl.max_cats} 只猫参与`);
      }

      // 2. 猫咪归属校验：不能拿别人的猫生成
      if (catIds.length) {
        const cats = await query(
          'select id from cat where id = any($1::uuid[]) and user_id = $2 and archived_at is null',
          [catIds, request.user.id]
        );
        if (cats.rows.length !== new Set(catIds).size) {
          throw errors.forbidden('存在无权使用的猫咪档案');
        }
      }

      // 3. 素材归属与状态校验
      if (assetIds.length) {
        const assets = await query(
          `select id from asset
           where id = any($1::uuid[]) and owner_user_id = $2 and status = 'ready'`,
          [assetIds, request.user.id]
        );
        if (assets.rows.length !== new Set(assetIds).size) {
          throw errors.badRequest('素材尚未就绪或不属于当前用户');
        }
      }

      const cost = tpl.credits_cost || 1;

      // 幂等、扣额度、任务及流水都在同一事务内。
      return withTransaction(async (client) => {
        if (requestKey) {
          await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`${request.user.id}:${requestKey}`]);
          const existing = await client.query('select id,status,cat_ids,template_key,input_asset_ids from generation_job where user_id=$1 and request_key=$2', [request.user.id,requestKey]);
          if (existing.rows.length) {
            const old=existing.rows[0];
            if (old.template_key!==templateKey || JSON.stringify(old.cat_ids)!==JSON.stringify([...new Set(catIds)]) || JSON.stringify(old.input_asset_ids)!==JSON.stringify([...new Set(assetIds)])) throw errors.conflict('提交标识已用于其他照片');
            return ok({jobId:old.id,status:old.status,pollAfterMs:1500,reused:true});
          }
        }
        const quota = await requireQuota(request.user.id, cost, client, 'image');
        const inserted = await client.query(
          `insert into generation_job
             (user_id, client, cat_ids, template_key, input_asset_ids, params, credits_cost, request_key, max_attempts)
           values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
           returning id,status,created_at`,
          [request.user.id,request.client,[...new Set(catIds)],templateKey,[...new Set(assetIds)],JSON.stringify(options),cost,requestKey||null,templateKey==='pet-sticker'?1:2]
        );
        await client.query(
          `insert into credit_ledger (user_id,delta,reason,ref_id,balance_after) values ($1,$2,$3,$4,$5)`,
          [request.user.id, quota.unlimited ? 0 : -cost, quota.unlimited ? 'generation_vip_consume' : 'generation_consume', inserted.rows[0].id, quota.unlimited ? null : quota.used_today]
        );
        return ok({
          jobId: inserted.rows[0].id,
          status: inserted.rows[0].status,
          pollAfterMs: 1500,
          remainingToday: quota.unlimited ? null : quota.remaining,
          unlimited: quota.unlimited
        });
      });
    }
  );

  app.get('/:id', async (request) => {
    const result = await query(
      `select j.*, w.id as work_id
       from generation_job j
       left join work w on w.job_id = j.id
       where j.id = $1 and j.user_id = $2`,
      [request.params.id, request.user.id]
    );
    const job = result.rows[0];
    if (!job) throw errors.notFound('生成任务不存在');

    // 任务表只存 assetId，图片地址每次现签，避免过期链接被客户端缓存
    let resultPayload = null;
    if (job.status === 'succeeded' && job.result) {
      const imageAssetId = job.result.imageAssetId;
      const mediaAssetId = job.result.mediaAssetId || job.result.videoAssetId;
      const urlMap = await resolveAssetUrls([imageAssetId, mediaAssetId]);
      const videoMap = await resolveVideoAssetRefs([mediaAssetId]);
      const video = mediaAssetId ? videoMap.get(mediaAssetId) : null;
      resultPayload = {
        ...job.result,
        image: imageAssetId
          ? { assetId: imageAssetId, url: urlMap.get(imageAssetId) || null }
          : null,
        media: mediaAssetId
          ? (video || { assetId: mediaAssetId, url: urlMap.get(mediaAssetId) || null, mime: job.result.mime || null })
          : null
      };
    }

    return ok({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      workId: job.work_id || null,
      error: job.error_code
        ? { code: job.error_code, message: job.error_message }
        : null,
      result: resultPayload,
      createdAt: job.created_at,
      finishedAt: job.finished_at
    });
  });

  app.post('/:id/cancel', async (request) => {
    const result = await query(
      `update generation_job
       set status = 'canceled', finished_at = now()
       where id = $1 and user_id = $2 and status = 'queued'
       returning id, credits_cost`,
      [request.params.id, request.user.id]
    );
    if (!result.rows.length) throw errors.conflict('任务已开始执行，无法取消');
    await refundQuota(request.user.id, result.rows[0].credits_cost, result.rows[0].id);
    return ok({ canceled: true });
  });

  app.get('/', async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 20, 50);
    const result = await query(
      `select id, status, template_key, cat_ids, created_at, finished_at
       from generation_job where user_id = $1
       order by created_at desc limit $2`,
      [request.user.id, limit]
    );
    return ok({
      items: result.rows.map((row) => ({
        jobId: row.id,
        status: row.status,
        templateKey: row.template_key,
        catIds: row.cat_ids,
        createdAt: row.created_at,
        finishedAt: row.finished_at
      }))
    });
  });

  app.get('/quota/current', async (request) => ok({ quota: await getQuota(request.user.id) }));
}
