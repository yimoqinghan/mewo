import { query } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';
import { fetchBuffer } from '../../lib/http.js';
import { config } from '../../config.js';
import { signPutUrl, signGetUrl, headObject, buildObjectKey, extFromMime, putObject, deleteObject } from '../../services/storage/index.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/amr']);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const STATIC_MEDIA_HOSTS = new Set(['api.missmeow.net', 'static.missmeow.net']);

function isAllowedStaticUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const publicHost = new URL(config.publicBaseUrl).hostname;
    return url.protocol === 'https:' && (url.hostname === publicHost || STATIC_MEDIA_HOSTS.has(url.hostname));
  } catch {
    return false;
  }
}

function imageMimeFromUrl(sourceUrl) {
  const extension = String(sourceUrl).match(/\.(jpg|jpeg|png|webp)(?:\?|$)/i)?.[1]?.toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[extension] || '';
}

/**
 * 直传方案：客户端先要签名，再直接把文件 PUT 到 COS。
 * 好处是 2C2G 服务器完全不碰图片字节流，
 * 月流量 200GB 的套餐不会被用户上传吃光。
 */
export default async function uploadRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  /**
   * 把自有公开静态素材导入当前用户的 COS 资产。
   * 仅允许 api/static.missmeow.net，避免把任意远程地址变成服务端 SSRF。
   * 用户照片仍走下面的客户端直传接口，不经过业务服务器。
   */
  app.post(
    '/import-static',
    {
      schema: {
        body: {
          type: 'object',
          required: ['sourceUrl'],
          properties: {
            sourceUrl: { type: 'string', format: 'uri', maxLength: 2048 },
            purpose: { type: 'string', enum: ['input', 'avatar'] }
          }
        }
      }
    },
    async (request) => {
      const { sourceUrl, purpose = 'input' } = request.body;
      if (!isAllowedStaticUrl(sourceUrl)) throw errors.badRequest('只支持导入言喵公开素材');

      const downloaded = await fetchBuffer(sourceUrl, { timeoutMs: 30000, maxBytes: MAX_BYTES });
      const mime = downloaded.contentType.startsWith('image/') ? downloaded.contentType : imageMimeFromUrl(sourceUrl);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
        throw errors.badRequest('公开素材格式不支持');
      }

      const objectKey = buildObjectKey({ userId: request.user.id, purpose, ext: extFromMime(mime) });
      try {
        await putObject({ objectKey, buffer: downloaded.buffer, contentType: mime });
        const inserted = await query(
          `insert into asset (owner_user_id, object_key, mime, byte_size, purpose, status)
           values ($1, $2, $3, $4, $5, 'ready')
           returning id`,
          [request.user.id, objectKey, mime, downloaded.buffer.length, purpose]
        );
        return ok({ assetId: inserted.rows[0].id, status: 'ready' });
      } catch (error) {
        await deleteObject(objectKey).catch(() => {});
        throw error;
      }
    }
  );

  app.post(
    '/sign',
    {
      schema: {
        body: {
          type: 'object',
          required: ['purpose', 'mime'],
          properties: {
            purpose: { type: 'string', enum: ['input', 'avatar', 'voice'] },
            mime: { type: 'string' },
            byteSize: { type: 'integer', minimum: 1 }
          }
        }
      }
    },
    async (request) => {
      const { purpose, mime, byteSize } = request.body;

      const isVoice = purpose === 'voice';
      const isAvatar = purpose === 'avatar';
      const isAudio = mime.startsWith('audio/');
      const isImage = mime.startsWith('image/');
      if (!ALLOWED_MIME.has(mime) || (isVoice && !isAudio) || (!isVoice && isAudio) || (isAvatar && !isImage)) {
        throw errors.badRequest(
          isVoice
            ? '仅支持 mp3 / m4a / wav / amr 录音'
            : isAvatar
              ? '头像仅支持 jpg / png / webp 图片'
              : '仅支持 jpg / png / webp 图片或 mp4 视频'
        );
      }
      if (byteSize && byteSize > (mime === 'video/mp4' ? MAX_VIDEO_BYTES : MAX_BYTES)) {
        throw errors.badRequest(`${isVoice ? '录音' : mime === 'video/mp4' ? '视频' : '图片'}不能超过 ${mime === 'video/mp4' ? '50MB' : '10MB'}`);
      }

      const objectKey = buildObjectKey({
        userId: request.user.id,
        purpose,
        ext: extFromMime(mime)
      });

      const inserted = await query(
        `insert into asset (owner_user_id, object_key, mime, byte_size, purpose, status)
         values ($1, $2, $3, $4, $5, 'pending')
         returning id, object_key`,
        [request.user.id, objectKey, mime, byteSize || null, purpose]
      );

      const uploadUrl = await signPutUrl({
        objectKey,
        contentType: mime,
        expires: config.cos.signTtl
      });

      return ok({
        assetId: inserted.rows[0].id,
        objectKey,
        method: 'PUT',
        uploadUrl,
        // 客户端 PUT 时必须带上这个头，否则 COS 签名校验失败
        headers: { 'Content-Type': mime },
        expiresIn: config.cos.signTtl
      });
    }
  );

  /** 上传完成后回调，服务端确认对象真实存在再标记为可用 */
  app.post('/:id/complete', async (request) => {
    const result = await query(
      `select * from asset where id = $1 and owner_user_id = $2`,
      [request.params.id, request.user.id]
    );
    const asset = result.rows[0];
    if (!asset) throw errors.notFound('素材不存在');
    if (asset.status === 'ready') return ok({ assetId: asset.id, status: 'ready' });

    let meta;
    try {
      meta = await headObject(asset.object_key);
    } catch {
      throw errors.badRequest('文件尚未上传成功，请重试');
    }

    const maxBytes = asset.mime === 'video/mp4' ? MAX_VIDEO_BYTES : MAX_BYTES;
    if (!Number(meta.headers?.['content-length']) || Number(meta.headers['content-length']) > maxBytes) throw errors.badRequest(`${asset.mime === 'video/mp4' ? '视频' : asset.purpose === 'voice' ? '录音' : '图片'}为空或超过 ${asset.mime === 'video/mp4' ? '50MB' : '10MB'}`);
    await query(
      `update asset set status = 'ready', byte_size = coalesce($2, byte_size) where id = $1`,
      [asset.id, Number(meta.headers?.['content-length']) || null]
    );

    return ok({ assetId: asset.id, status: 'ready' });
  });

  app.get('/:id/url', async (request) => {
    const result = await query(
      `select * from asset where id = $1 and owner_user_id = $2`,
      [request.params.id, request.user.id]
    );
    const asset = result.rows[0];
    if (!asset || asset.status !== 'ready') throw errors.notFound('素材不存在或未就绪');
    return ok({ url: await signGetUrl(asset.object_key), expiresIn: config.cos.signTtl });
  });
}
