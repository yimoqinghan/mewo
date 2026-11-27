import { query } from '../../db/pool.js';
import { signGetUrl } from '../../services/storage/index.js';
import { verifyVideoStreamToken } from '../../services/video-stream.js';

/**
 * 给小程序 video 组件返回短时有效的 HLS 播放清单。
 * m3u8 中的每个 ts 都单独签名，避免私有 COS 只签名清单而切片 403。
 */
export default async function videoAssetRoutes(app) {
  app.get('/:assetId/stream.m3u8', async (request, reply) => {
    const { assetId } = request.params;
    const { expires, token } = request.query || {};
    if (!verifyVideoStreamToken(assetId, expires, token)) {
      return reply.code(403).send({ ok: false, error: { code: 'STREAM_EXPIRED', message: '视频播放链接已过期，请重新打开' } });
    }

    const result = await query(
      `select a.id, a.status, a.mime, v.playlist, v.segment_object_keys
       from asset a
       join video_variant v on v.asset_id = a.id and v.format = 'hls' and v.status = 'ready'
       where a.id = $1 and a.status = 'ready' and a.mime = 'video/mp4'`,
      [assetId]
    );
    const row = result.rows[0];
    if (!row) return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: '视频切片不存在' } });

    const keys = Array.isArray(row.segment_object_keys) ? row.segment_object_keys : [];
    const ttl = Math.max(60, Math.min(900, Number(expires) - Math.floor(Date.now() / 1000)));
    const lines = String(row.playlist || '').split(/\r?\n/);
    let segmentIndex = 0;
    const rewritten = [];
    for (const line of lines) {
      if (line && !line.startsWith('#') && /\.ts(?:\?|$)/i.test(line)) {
        const objectKey = keys[segmentIndex++];
        rewritten.push(objectKey ? await signGetUrl(objectKey, ttl) : line);
      } else {
        rewritten.push(line);
      }
    }

    return reply
      .type('application/vnd.apple.mpegurl')
      .header('cache-control', 'private, max-age=30')
      .send(rewritten.join('\n'));
  });
}
