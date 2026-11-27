import { query } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';
import { fetchBuffer } from '../../lib/http.js';
import { signGetUrl } from '../../services/storage/index.js';
import { transcribeAudio } from '../../services/ai/index.js';

/** 将已上传的语音素材交给配置好的 ASR 服务，并只返回文字。 */
export default async function transcriptionRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['assetId'],
          properties: { assetId: { type: 'string', format: 'uuid' } }
        }
      }
    },
    async (request) => {
      const result = await query(
        `select id, object_key, mime, purpose, status
           from asset
          where id = $1 and owner_user_id = $2`,
        [request.body.assetId, request.user.id]
      );
      const asset = result.rows[0];
      if (!asset || asset.status !== 'ready' || asset.purpose !== 'voice') {
        throw errors.badRequest('语音素材不可识别');
      }

      const input = await fetchBuffer(await signGetUrl(asset.object_key), {
        timeoutMs: 30000,
        maxBytes: 10 * 1024 * 1024
      });
      return ok(await transcribeAudio({ buffer: input.buffer, mime: asset.mime }));
    }
  );
}
