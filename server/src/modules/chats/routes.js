import crypto from 'node:crypto';
import { query, withTransaction } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';
import { requireQuota, refundQuotaDirect } from '../../services/quota.js';
import { buildCatSystemPrompt, chatCompletion } from '../../services/ai/chat.js';

const messageSchema = {
  type: 'object',
  required: ['role', 'text'],
  properties: {
    role: { type: 'string', enum: ['user', 'assistant'] },
    text: { type: 'string', minLength: 1, maxLength: 4000 }
  },
  additionalProperties: false
};

export default async function chatRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.get(
    '/history',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['catId'],
          properties: {
            catId: { type: 'string', format: 'uuid' },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 200 }
          }
        }
      }
    },
    async (request) => {
      const limit = Math.min(Number(request.query.limit) || 200, 200);
      const cat = await query(
        `select id from cat where id = $1 and user_id = $2 and archived_at is null`,
        [request.query.catId, request.user.id]
      );
      if (!cat.rows.length) throw errors.notFound('猫咪档案不存在');

      const result = await query(
        `select id, role, content, model, client_message_id, created_at
         from chat_message
         where user_id = $1 and cat_id = $2
         order by created_at desc, id desc
         limit $3`,
        [request.user.id, request.query.catId, limit]
      );
      return ok({
        items: result.rows.reverse().map((row) => ({
          id: row.id,
          clientMessageId: row.client_message_id,
          role: row.role,
          text: row.content,
          model: row.model || null,
          createdAt: row.created_at
        }))
      });
    }
  );

  app.post(
    '/history',
    {
      schema: {
        body: {
          type: 'object',
          required: ['catId', 'messages'],
          additionalProperties: false,
          properties: {
            catId: { type: 'string', format: 'uuid' },
            messages: {
              type: 'array',
              maxItems: 200,
              items: {
                type: 'object',
                required: ['id', 'role', 'text'],
                additionalProperties: false,
                properties: {
                  id: { type: 'string', minLength: 1, maxLength: 128 },
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  text: { type: 'string', minLength: 1, maxLength: 4000 },
                  createdAt: { type: 'integer' }
                }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const cat = await query(
        `select id from cat where id = $1 and user_id = $2 and archived_at is null`,
        [request.body.catId, request.user.id]
      );
      if (!cat.rows.length) throw errors.notFound('猫咪档案不存在');

      const messages = request.body.messages;
      if (!messages.length) return ok({ imported: 0 });

      const roles = messages.map((item) => item.role);
      const contents = messages.map((item) => item.text.trim());
      const clientIds = messages.map((item) => item.id);
      const createdAts = messages.map((item) => (item.createdAt ? Number(item.createdAt) : null));

      await query(
        `insert into chat_message (user_id, cat_id, role, content, client_message_id, created_at)
         select $1, $2, role, content, client_message_id, coalesce(to_timestamp(created_ms / 1000.0), now())
         from unnest($3::text[], $4::text[], $5::text[], $6::bigint[])
           as t(role, content, client_message_id, created_ms)
         on conflict (user_id, cat_id, client_message_id, role)
         where client_message_id is not null do nothing`,
        [request.user.id, request.body.catId, roles, contents, clientIds, createdAts]
      );
      return ok({ imported: messages.length });
    }
  );

  app.delete(
    '/history',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['catId'],
          properties: { catId: { type: 'string', format: 'uuid' } }
        }
      }
    },
    async (request) => {
      const result = await query(
        `delete from chat_message m
         using cat c
         where m.user_id = $1 and m.cat_id = $2
           and c.id = m.cat_id and c.user_id = $1
         returning m.id`,
        [request.user.id, request.query.catId]
      );
      return ok({ deleted: true, count: result.rowCount || 0 });
    }
  );

  app.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['catId', 'model', 'messages'],
          additionalProperties: false,
          properties: {
            catId: { type: 'string', format: 'uuid' },
            model: { type: 'string', minLength: 1, maxLength: 128 },
            messages: { type: 'array', minItems: 1, maxItems: 32, items: messageSchema },
            userMessage: {
              type: 'object',
              required: ['id', 'text'],
              additionalProperties: false,
              properties: {
                id: { type: 'string', minLength: 1, maxLength: 128 },
                text: { type: 'string', minLength: 1, maxLength: 4000 },
                createdAt: { type: 'integer' }
              }
            }
          }
        }
      }
    },
    async (request) => {
      const { catId, model, messages } = request.body;
      const catResult = await query(
        `select c.*, p.past_life_role, p.past_life_story, p.speech_style,
                p.catchphrase, p.prompt_snippet
         from cat c
         left join cat_persona p on p.cat_id = c.id
         where c.id = $1 and c.user_id = $2 and c.archived_at is null`,
        [catId, request.user.id]
      );
      if (!catResult.rows.length) throw errors.notFound('猫咪档案不存在，无法开始聊天');

      const cat = catResult.rows[0];
      const input = messages.map((item) => ({ role: item.role, content: item.text.trim() }));
      const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user');
      const userMessage = request.body.userMessage || {
        id: crypto.randomUUID(),
        text: lastUserMessage?.text || ''
      };
      if (!userMessage.text.trim()) throw errors.badRequest('聊天内容不能为空');
      const refId = crypto.randomUUID();
      await withTransaction(async (client) => {
        const quota = await requireQuota(request.user.id, 1, client, 'chat');
        await client.query(
          `insert into credit_ledger (user_id, delta, reason, ref_id, balance_after)
           values ($1, $2, $3, $4, $5)`,
          [request.user.id, quota.unlimited ? 0 : -1, quota.unlimited ? 'chat_vip_consume' : 'chat_consume', refId, quota.unlimited ? null : quota.used_today]
        );
      });

      let completion;
      try {
        completion = await chatCompletion({
          model,
          messages: input,
          systemPrompt: buildCatSystemPrompt({ cat, persona: cat })
        });
      } catch (error) {
        await refundQuotaDirect(request.user.id, 1, refId, 'chat_refund', 'chat');
        throw error;
      }

      const assistantId = crypto.randomUUID();
      await withTransaction(async (client) => {
        await client.query(
          `insert into chat_message (user_id, cat_id, role, content, model, client_message_id)
           values ($1, $2, 'user', $3, $4, $5)
           on conflict (user_id, cat_id, client_message_id, role)
           where client_message_id is not null do nothing`,
          [request.user.id, catId, userMessage.text.trim(), model, userMessage.id]
        );
        await client.query(
          `insert into chat_message (id, user_id, cat_id, role, content, model)
           values ($1, $2, $3, 'assistant', $4, $5)`,
          [assistantId, request.user.id, catId, completion.content, model]
        );
      });

      return ok({
        message: { id: assistantId, role: 'assistant', content: completion.content, createdAt: new Date().toISOString() },
        model,
        usage: completion.usage,
        providerJobId: completion.providerJobId
      });
    }
  );
}
