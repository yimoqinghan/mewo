import 'dotenv/config';

function num(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  if (!value) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function imageModels(value, fallbackId) {
  const ids = list(value);
  return ids.length ? ids : [fallbackId];
}

function imageModelOptions(ids, labels) {
  return ids.map((id, index) => ({ id, label: labels[index] || id }));
}

function modelOptions(value, labels, fallback) {
  const ids = list(value);
  const selected = ids.length ? ids : fallback;
  return selected.map((id, index) => ({ id, label: labels[index] || id }));
}

const VIDEO_MODEL_CATALOG = {
  'minimax-h3': {
    label: 'MiniMax H3',
    protocol: 'media',
    minDuration: 4,
    maxDuration: 15,
    referenceField: 'image_url',
    supportsImageReference: true
  },
  'hailuo-h3-cankaosheng': {
    label: '海螺 H3 参考生',
    protocol: 'media',
    minDuration: 4,
    maxDuration: 15,
    referenceField: 'images',
    supportsImageReference: true
  },
  'seedance-2.5-guanfang-anmiao': {
    label: 'SD 2.5 满血版按秒',
    protocol: 'seedance',
    minDuration: 4,
    maxDuration: 30,
    referenceField: 'content',
    supportsImageReference: true
  },
  'hailuo-h3-quannengcankao': {
    label: '海螺 H3 全能参考',
    protocol: 'media',
    minDuration: 4,
    maxDuration: 15,
    referenceField: 'images',
    supportsImageReference: true
  },
  'video-enhance': {
    label: '视频超分',
    protocol: 'media',
    capability: 'enhance',
    requiresVideoInput: true,
    referenceField: 'video_url',
    supportsImageReference: false
  }
};

function videoModelOptions(value, labels) {
  const ids = list(value);
  const selected = ids.length ? ids : Object.keys(VIDEO_MODEL_CATALOG);
  return selected.map((id, index) => ({
    id,
    ...(VIDEO_MODEL_CATALOG[id] || {
      label: id,
      protocol: 'media',
      minDuration: 4,
      maxDuration: 15,
      referenceField: 'images',
      supportsImageReference: true
    }),
    label: labels[index] || VIDEO_MODEL_CATALOG[id]?.label || id
  }));
}

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  isProd: env === 'production',
  port: num(process.env.PORT, 3000),
  host: process.env.HOST || '127.0.0.1',
  logLevel: process.env.LOG_LEVEL || 'info',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'http://127.0.0.1:3000',

  corsOrigins: list(process.env.CORS_ORIGINS),

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
    accessTtl: process.env.JWT_ACCESS_TTL || '2h',
    refreshTtlDays: num(process.env.REFRESH_TTL_DAYS, 30)
  },

  db: {
    connectionString:
      process.env.DATABASE_URL || 'postgres://yanmiao:yanmiao@127.0.0.1:5432/yanmiao',
    max: num(process.env.DB_POOL_MAX, 5)
  },

  wechat: {
    appId: process.env.WX_MP_APPID || '',
    secret: process.env.WX_MP_SECRET || '',
    envVersion: process.env.WX_MP_ENV_VERSION || (env === 'production' ? 'release' : 'trial')
  },

  douyin: {
    appId: process.env.DY_MP_APPID || '',
    secret: process.env.DY_MP_SECRET || ''
  },

  cos: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || 'ap-shanghai',
    cdnDomain: process.env.COS_CDN_DOMAIN || '',
    // 用户媒体（u/ 前缀）默认走签名 URL；开启后统一返回 CDN 地址。
    // 只有在 CDN 完成「私有桶回源」授权后，才可置为 true。
    cdnPublicMedia: process.env.COS_CDN_PUBLIC_MEDIA === 'true',
    staticPrefix:
      (process.env.STATIC_ASSETS_PREFIX || 'static').replace(/^\/+|\/+$/g, '') || 'static',
    signTtl: num(process.env.COS_SIGN_TTL, 900),
    get enabled() {
      return Boolean(this.secretId && this.secretKey && this.bucket);
    }
  },

  // 生产环境已有 COS 配置时默认从 COS 读取；显式写 false 可保留本地回退。
  // deploy-server.sh 会在重启服务前先完成 static/ 同步，避免部署窗口内出现 403。
  staticAssetsFromCos:
    process.env.STATIC_ASSETS_FROM_COS === 'true' ||
    ((process.env.STATIC_ASSETS_FROM_COS === undefined ||
      process.env.STATIC_ASSETS_FROM_COS === '') &&
      env === 'production' &&
      Boolean(process.env.COS_BUCKET)),

  ai: {
    provider: process.env.AI_PROVIDER || 'mock',
    openai: {
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      imageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
      imageModels: imageModelOptions(
        imageModels(
          process.env.OPENAI_IMAGE_MODELS,
          process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst'
        ),
        list(process.env.OPENAI_IMAGE_MODEL_LABELS)
      ),
      // 灵泉等兼容服务的真实媒体协议不是 /images/*，auto 会按服务地址选择。
      imageProtocol: process.env.OPENAI_IMAGE_PROTOCOL || 'auto',
      gifModel: process.env.OPENAI_GIF_MODEL || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst',
      quality: process.env.OPENAI_IMAGE_QUALITY || 'medium',
      transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe'
    },
    ark: {
      baseUrl: process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: process.env.ARK_API_KEY || '',
      imageModel: process.env.ARK_IMAGE_MODEL || 'doubao-seedream-4-0-250828'
    },
    chat: {
      // 聊天服务单独配置，避免误把生图密钥或模型发到聊天上游。
      baseUrl: process.env.CHAT_BASE_URL || process.env.OPENAI_BASE_URL || '',
      apiKey: process.env.CHAT_API_KEY || process.env.OPENAI_API_KEY || '',
      models: modelOptions(
        process.env.CHAT_MODEL_IDS,
        list(process.env.CHAT_MODEL_LABELS),
        ['kimi-k3', 'tt-6-luna', 'qwen4-max', 'hy4-flash', 'kimi-k3.1-pro', 'deepseek-v4.1-flash']
      ),
      // 兼容已经打开过旧版小程序的用户，避免本地缓存的旧展示名触发上游 404。
      modelAliases: {
        'hunyuan-4': 'tt-6-luna',
        'qwen-4-max': 'qwen4-max',
        'hunyuan-4-flash': 'hy4-flash',
        'kimi-k3-1-pro': 'kimi-k3.1-pro',
        'ds-v4-1-flash': 'deepseek-v4.1-flash'
      }
    },
    media: {
      // GIF 使用独立的图生视频/动图模型，不再由前端 CSS 假装动效。
      baseUrl: process.env.MEDIA_BASE_URL || '',
      apiKey: process.env.MEDIA_API_KEY || '',
      gifPath: process.env.MEDIA_GIF_PATH || '/videos/generations',
      gifStatusPath: process.env.MEDIA_GIF_STATUS_PATH || '/videos',
      gifModel: process.env.MEDIA_GIF_MODEL || '',
      timeoutMs: num(process.env.MEDIA_TIMEOUT_MS, 180000)
    },
    video: {
      baseUrl: process.env.VIDEO_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.lk888.ai/v1',
      apiKey: process.env.VIDEO_API_KEY || process.env.OPENAI_API_KEY || '',
      defaultModel: process.env.VIDEO_MODEL || 'minimax-h3',
      models: videoModelOptions(process.env.VIDEO_MODEL_IDS, list(process.env.VIDEO_MODEL_LABELS)),
      timeoutMs: num(process.env.VIDEO_TIMEOUT_MS, 3600000),
      hls: {
        enabled: process.env.VIDEO_HLS_ENABLED !== 'false',
        ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',
        segmentSeconds: Math.max(1, num(process.env.VIDEO_HLS_SEGMENT_SECONDS, 1)),
        timeoutMs: num(process.env.VIDEO_HLS_TIMEOUT_MS, 180000)
      }
    },
    timeoutMs: num(process.env.AI_TIMEOUT_MS, 180000)
  },

  sticker: {
    python: process.env.STICKER_PYTHON || '',
    modelDir: process.env.STICKER_MODEL_DIR || '',
    model: process.env.STICKER_MODEL || 'u2net',
    timeoutMs: num(process.env.STICKER_TIMEOUT_MS, 120000)
  },

  quota: {
    imageDailyFreeLimit: Math.max(1, num(process.env.IMAGE_DAILY_FREE_LIMIT || process.env.DAILY_FREE_LIMIT, 3)),
    chatDailyFreeLimit: Math.max(1, num(process.env.CHAT_DAILY_FREE_LIMIT, 30))
  },

  moderation: {
    // 上线后建议打开：生成结果先过微信图片安全接口再入库
    enabled: process.env.MODERATION_ENABLED === 'true'
  },

  worker: {
    concurrency: Math.max(1, num(process.env.WORKER_CONCURRENCY, 1)),
    pollMs: num(process.env.WORKER_POLL_MS, 1500),
    lockTimeoutMs: num(process.env.WORKER_LOCK_TIMEOUT_MS, 300000)
  }
};

/**
 * 生产环境硬性检查。缺失关键配置时直接启动失败，
 * 好过上线后才发现签名错误或数据库连不上。
 */
export function assertProductionConfig(logger = console) {
  if (!config.isProd) return;
  const missing = [];
  if (config.jwt.secret === 'dev-only-insecure-secret' || config.jwt.secret.length < 32) {
    missing.push('JWT_SECRET（长度需 >= 32）');
  }
  if (!config.db.connectionString) missing.push('DATABASE_URL');
  if (!config.cos.enabled) missing.push('COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET');
  if (!config.wechat.appId || !config.wechat.secret) missing.push('WX_MP_APPID / WX_MP_SECRET');
  if (config.ai.provider === 'ark' && !config.ai.ark.apiKey) missing.push('ARK_API_KEY');
  if (config.ai.provider === 'openai' && !config.ai.openai.apiKey) missing.push('OPENAI_API_KEY');
  if (missing.length) {
    logger.error(`生产环境配置缺失：${missing.join('、')}`);
    throw new Error('生产环境配置不完整');
  }
}
