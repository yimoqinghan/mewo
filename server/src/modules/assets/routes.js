import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { config } from '../../config.js';
import { cdnUrl, signGetUrl } from '../../services/storage/index.js';

const ASSET_ROOT = path.resolve(fileURLToPath(new URL('../../../public/assets/', import.meta.url)));
const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary'
};

/** 公开的品牌设计素材。用户照片和生成作品仍走私有对象存储。 */
export default async function assetRoutes(app) {
  app.get('/assets/*', async (request, reply) => {
    const relative = String(request.params['*'] || '').replace(/^\/+/, '');
    const filePath = path.resolve(ASSET_ROOT, relative);
    if (filePath !== ASSET_ROOT && !filePath.startsWith(`${ASSET_ROOT}${path.sep}`)) {
      return reply.code(400).send({ ok: false, error: { code: 'BAD_REQUEST', message: '资源路径不合法' } });
    }

    // 静态品牌素材同步到 COS 的固定前缀后，优先走 CDN。
    // 通过 302 跳转，避免业务服务器继续占用本地磁盘和带宽。
    if (config.cos.enabled && config.staticAssetsFromCos) {
      try {
        const objectKey = `${config.cos.staticPrefix}/${relative}`;
        const url = cdnUrl(objectKey) || await signGetUrl(objectKey);
        return reply
          .code(302)
          .header('cache-control', 'public, max-age=300')
          .redirect(url);
      } catch {
        // COS 暂时不可用时继续尝试本地回退，避免开发环境完全不可用。
      }
    }

    try {
      const buffer = await readFile(filePath);
      const type = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      return reply
        .header('content-type', type)
        .header('cache-control', 'public, max-age=31536000, immutable')
        .send(buffer);
    } catch {
      return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '资源不存在' } });
    }
  });
}
