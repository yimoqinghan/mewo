import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';

function buildCatSpeech(text, catName = '这只喵') {
  const clean = String(text || '').trim().slice(0, 240);
  const suffix = /[?？]$/.test(clean) ? '喵？' : '喵～';
  return {
    mode: 'mock',
    text: `喵呜，${clean || `我想和${catName}说说话`}${suffix}`,
    meaning: '已把你的话改成更适合对喵表达的短句。',
    audioUrl: null,
    disclaimer: '当前是演示喵声；真实猫咪不一定理解人类语言，请观察它的反应。'
  };
}

export default async function catSpeechRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['text'],
          additionalProperties: false,
          properties: {
            catId: { type: 'string', format: 'uuid' },
            text: { type: 'string', minLength: 1, maxLength: 240 }
          }
        }
      }
    },
    async (request) => {
      let catName = '这只喵';
      if (request.body.catId) {
        const cat = await query(
          `select name from cat where id = $1 and user_id = $2 and archived_at is null`,
          [request.body.catId, request.user.id]
        );
        if (!cat.rows.length) throw errors.notFound('猫咪档案不存在');
        catName = cat.rows[0].name;
      }
      return ok({ jobId: crypto.randomUUID(), status: 'succeeded', progress: 100, result: buildCatSpeech(request.body.text, catName) });
    }
  );
}
