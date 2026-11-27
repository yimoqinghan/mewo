import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config, assertProductionConfig } from './config.js';
import { AppError, ok } from './lib/errors.js';
import { registerAuth } from './plugins/auth.js';
import authRoutes from './modules/auth/routes.js';
import catRoutes from './modules/cats/routes.js';
import { publicCatShareRoutes, protectedCatShareRoutes } from './modules/cats/public-share-routes.js';
import uploadRoutes from './modules/uploads/routes.js';
import generationRoutes from './modules/generations/routes.js';
import workRoutes from './modules/works/routes.js';
import metaRoutes from './modules/meta/routes.js';
import assetRoutes from './modules/assets/routes.js';
import videoAssetRoutes from './modules/video-assets/routes.js';
import transcriptionRoutes from './modules/transcriptions/routes.js';
import chatRoutes from './modules/chats/routes.js';
import catTranslationRoutes from './modules/cat-translations/routes.js';
import catSpeechRoutes from './modules/cat-speech/routes.js';
import legalRoutes from './modules/legal/routes.js';
import { registerDevStorageRoutes, registerDevAuthRoutes } from './modules/dev/routes.js';

const VALIDATION_FIELD_LABELS = {
  templateKey: '创作模板',
  catIds: '猫咪档案',
  assetIds: '参考图片',
  'options.model': '生图模型',
  'options.prompt': '画面描述',
  'options.professionalPrompt': '专业补充要求',
  'options.aspectRatio': '画幅比例',
  'options.skillId': '创作风格',
  'options.skillPrompt': '风格要求',
  'options.negativePrompt': '不希望出现的内容'
};

function validationDetailMessage(item) {
  const path = item.instancePath?.replace(/^\//, '').replaceAll('/', '.') || item.params?.missingProperty || '请求参数';
  const field = VALIDATION_FIELD_LABELS[path] || path;
  if (item.keyword === 'required') return `缺少${VALIDATION_FIELD_LABELS[item.params?.missingProperty] || item.params?.missingProperty || field}`;
  if (item.keyword === 'minLength') return `${field}不能为空`;
  if (item.keyword === 'maxLength') return `${field}过长`;
  if (item.keyword === 'minItems') return `${field}数量不足`;
  if (item.keyword === 'maxItems') return `${field}数量过多`;
  if (item.keyword === 'format') return `${field}格式不正确`;
  if (item.keyword === 'type') return `${field}类型不正确`;
  return `${field}校验失败`;
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // 生产环境不打请求体，避免把用户照片 base64 写进日志
      redact: ['req.headers.authorization', 'req.headers.cookie']
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024
  });

  assertProductionConfig(app.log);

  await app.register(cors, {
    // 小程序没有 Origin，H5 需要白名单；开发环境放开便于真机调试
    origin: config.corsOrigins.length
      ? config.corsOrigins
      : config.isProd
        ? false
        : true,
    credentials: false,
    allowedHeaders: ['content-type', 'authorization', 'x-client'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
  });

  await app.register(rateLimit, {
    max: 180,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      ok: false,
      error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' }
    })
  });

  await registerAuth(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.status).send({
        ok: false,
        error: { code: error.code, message: error.message, details: error.details }
      });
    }

    if (error.validation) {
      const details = error.validation.map((item) => ({
        field: item.instancePath || item.params?.missingProperty,
        rule: item.keyword,
        message: validationDetailMessage(item)
      }));
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: `请求参数不合法：${details[0]?.message || '请检查提交内容'}`,
          details
        }
      });
    }

    if (error.statusCode === 429) {
      return reply.code(429).send({
        ok: false,
        error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' }
      });
    }

    // Fastify 自身的 4xx（空 body、body 过大、content-type 不符等）
    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: { code: 'BAD_REQUEST', message: '请求格式不合法', details: { reason: error.code } }
      });
    }

    request.log.error({ err: error }, '未处理异常');
    return reply.code(500).send({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: '服务异常，请稍后重试' }
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      ok: false,
      error: { code: 'NOT_FOUND', message: `接口不存在：${request.method} ${request.url}` }
    });
  });

  app.get('/healthz', async () => ok({ status: 'ok', uptime: process.uptime() }));

  app.get('/readyz', async () => {
    const { query } = await import('./db/pool.js');
    await query('select 1');
    return ok({ status: 'ready', ai: config.ai.provider });
  });

  await app.register(legalRoutes, { prefix: '/legal' });

  await app.register(assetRoutes);
  await app.register(videoAssetRoutes, { prefix: '/v1/video-assets' });
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(metaRoutes, { prefix: '/v1/meta' });
  await app.register(publicCatShareRoutes, { prefix: '/v1/cats' });
  await app.register(catRoutes, { prefix: '/v1/cats' });
  await app.register(protectedCatShareRoutes, { prefix: '/v1/cats' });
  await app.register(uploadRoutes, { prefix: '/v1/uploads' });
  await app.register(transcriptionRoutes, { prefix: '/v1/transcriptions' });
  await app.register(chatRoutes, { prefix: '/v1/chats' });
  await app.register(catTranslationRoutes, { prefix: '/v1/cat-translations' });
  await app.register(catSpeechRoutes, { prefix: '/v1/cat-speech' });
  await app.register(generationRoutes, { prefix: '/v1/generations' });
  await app.register(workRoutes, { prefix: '/v1/works' });

  // 开发专用：模拟 COS 上传与免授权登录，生产环境不会注册
  if (!config.isProd) {
    await registerDevStorageRoutes(app);
    await app.register(async (instance) => registerDevAuthRoutes(instance), {
      prefix: '/v1/auth'
    });
  }

  return app;
}
