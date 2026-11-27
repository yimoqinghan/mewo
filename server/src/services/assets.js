import { config } from '../config.js';
import { query } from '../db/pool.js';
import { cdnUrl, signGetUrl } from './storage/index.js';
import { createVideoStreamUrl } from './video-stream.js';

/**
 * 把媒体对象键批量转成可访问地址。
 * 生成结果默认私有；启用 COS_CDN_PUBLIC_MEDIA 后，所有已就绪媒体都通过
 * CDN 地址返回，由 CDN/业务侧保护策略负责访问控制。
 */
export function imagePreviewQuery(mime) {
  if (!String(mime || '').startsWith('image/')) return null;
  return { 'imageMogr2/thumbnail/480x/': '' };
}

export async function resolveAssetUrls(assetIds = [], options = {}) {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (!ids.length) return new Map();

  const result = await query(
    `select id, object_key, visibility, status from asset where id = any($1::uuid[])`,
    [ids]
  );

  const map = new Map();
  await Promise.all(
    result.rows.map(async (row) => {
      if (row.status !== 'ready') {
        map.set(row.id, null);
        return;
      }
      // 用户媒体统一保持私有，必须使用带时效的 COS 签名地址。
      // CDN 的 /u/ 路径当前没有配置私有桶回源授权，直接返回 CDN URL 会得到 403；
      // CDN 只用于 server/modules/assets/routes.js 中的公开 static/ 品牌素材。
      const isUserMedia = row.object_key.startsWith('u/');
      if (config.cos.cdnPublicMedia && !isUserMedia) {
        const url = cdnUrl(row.object_key);
        if (url) {
          map.set(row.id, url);
          return;
        }
      }
      try {
        const query = options.preview ? imagePreviewQuery(row.mime) : null;
        map.set(row.id, await signGetUrl(row.object_key, config.cos.signTtl, query));
      } catch {
        map.set(row.id, null);
      }
    })
  );
  return map;
}

export function assetRef(assetId, url) {
  if (!assetId) return null;
  return { assetId, url: url || null };
}

/**
 * 视频同时返回三种能力：
 * - url：可直接下载/保存/分享的 MP4
 * - downloadUrl：带附件响应头的 MP4 下载地址
 * - hlsUrl：全屏播放器使用的 m3u8 地址
 */
export async function resolveVideoAssetRefs(assetIds = []) {
  const ids = [...new Set(assetIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const result = await query(
    `select a.id, a.object_key, a.mime, a.status, v.asset_id as hls_asset_id
     from asset a
     left join video_variant v on v.asset_id = a.id and v.format = 'hls' and v.status = 'ready'
     where a.id = any($1::uuid[])`,
    [ids]
  );
  const map = new Map();
  await Promise.all(result.rows.map(async (row) => {
    if (row.status !== 'ready' || row.mime !== 'video/mp4') {
      map.set(row.id, null);
      return;
    }
    try {
      const url = await signGetUrl(row.object_key, config.cos.signTtl);
      const downloadUrl = await signGetUrl(row.object_key, config.cos.signTtl, {
        'response-content-disposition': 'attachment; filename="yanmiao-video.mp4"'
      });
      map.set(row.id, {
        assetId: row.id,
        mime: row.mime,
        url,
        downloadUrl,
        hlsUrl: row.hls_asset_id ? createVideoStreamUrl(row.id) : null
      });
    } catch {
      map.set(row.id, null);
    }
  }));
  return map;
}
