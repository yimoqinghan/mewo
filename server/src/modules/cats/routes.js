import { query, withTransaction } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';
import { resolveAssetUrls } from '../../services/assets.js';

const CAT_FIELDS = `
  id, name, gender, age, birthday::text as birthday, breed, coat, traits, personality,
  likes, dislikes, avatar_asset_id, is_default, archived_at, created_at, updated_at
`;

function serialize(row, urlMap) {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    age: row.age || '',
    birthday: row.birthday,
    breed: row.breed,
    coat: row.coat,
    traits: row.traits || [],
    personality: row.personality,
    likes: row.likes || [],
    dislikes: row.dislikes || [],
    avatar: row.avatar_asset_id
      ? { assetId: row.avatar_asset_id, url: urlMap.get(row.avatar_asset_id) || null }
      : null,
    isDefault: row.is_default,
    archived: Boolean(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadCat(userId, catId) {
  const result = await query(
    `select ${CAT_FIELDS} from cat where id = $1 and user_id = $2`,
    [catId, userId]
  );
  if (!result.rows.length) throw errors.notFound('猫咪档案不存在');
  return result.rows[0];
}

const catBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 32 },
    gender: { type: 'string', maxLength: 16 },
    age: { type: 'string', maxLength: 32 },
    birthday: { type: 'string', format: 'date', pattern: '^(?!0000)[0-9]{4}-[0-9]{2}-[0-9]{2}$' },
    breed: { type: 'string', maxLength: 64 },
    coat: { type: 'string', maxLength: 64 },
    traits: { type: 'array', items: { type: 'string', maxLength: 32 }, maxItems: 12 },
    personality: { type: 'string', maxLength: 1000 },
    likes: { type: 'array', items: { type: 'string', maxLength: 32 }, maxItems: 12 },
    dislikes: { type: 'array', items: { type: 'string', maxLength: 32 }, maxItems: 12 },
    avatarAssetId: { type: 'string', format: 'uuid' },
    isDefault: { type: 'boolean' }
  }
};

export default async function catRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.get('/', async (request) => {
    const includeArchived = request.query?.includeArchived === 'true';
    const result = await query(
      `select ${CAT_FIELDS} from cat
       where user_id = $1 ${includeArchived ? '' : 'and archived_at is null'}
       order by is_default desc, created_at asc`,
      [request.user.id]
    );
    const urlMap = await resolveAssetUrls(result.rows.map((row) => row.avatar_asset_id));
    return ok({ items: result.rows.map((row) => serialize(row, urlMap)) });
  });

  app.post(
    '/',
    { schema: { body: { ...catBodySchema, required: ['name'] } } },
    async (request) => {
      const body = request.body;
      const id = await withTransaction(async (client) => {
        // 首只猫自动设为默认
        const count = await client.query(
          'select count(*)::int as total from cat where user_id = $1 and archived_at is null',
          [request.user.id]
        );
        const shouldDefault = body.isDefault === true || count.rows[0].total === 0;

        if (shouldDefault) {
          await client.query(
            'update cat set is_default = false where user_id = $1 and is_default',
            [request.user.id]
          );
        }

        const inserted = await client.query(
          `insert into cat
             (user_id, name, gender, age, birthday, breed, coat, traits, personality,
              likes, dislikes, avatar_asset_id, is_default)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           returning id`,
          [
            request.user.id,
            body.name,
            body.gender || null,
            body.age || null,
            body.birthday || null,
            body.breed || null,
            body.coat || null,
            body.traits || [],
            body.personality || null,
            body.likes || [],
            body.dislikes || [],
            body.avatarAssetId || null,
            shouldDefault
          ]
        );
        return inserted.rows[0].id;
      });

      const row = await loadCat(request.user.id, id);
      const urlMap = await resolveAssetUrls([row.avatar_asset_id]);
      return ok({ cat: serialize(row, urlMap) });
    }
  );

  app.get('/:id', async (request) => {
    const row = await loadCat(request.user.id, request.params.id);
    const persona = await query('select * from cat_persona where cat_id = $1', [row.id]);
    const urlMap = await resolveAssetUrls([row.avatar_asset_id]);
    return ok({
      cat: serialize(row, urlMap),
      persona: persona.rows[0] ? serializePersona(persona.rows[0]) : null
    });
  });

  app.patch(
    '/:id',
    { schema: { body: catBodySchema } },
    async (request) => {
      const body = request.body;
      await loadCat(request.user.id, request.params.id);

      const mapping = {
        name: 'name',
        gender: 'gender',
        age: 'age',
        birthday: 'birthday',
        breed: 'breed',
        coat: 'coat',
        traits: 'traits',
        personality: 'personality',
        likes: 'likes',
        dislikes: 'dislikes',
        avatarAssetId: 'avatar_asset_id'
      };

      const sets = [];
      const values = [];
      let index = 1;

      for (const [key, column] of Object.entries(mapping)) {
        if (body[key] !== undefined) {
          sets.push(`${column} = $${index}`);
          values.push(body[key]);
          index += 1;
        }
      }

      if (body.isDefault === true) {
        await query('update cat set is_default = false where user_id = $1 and is_default', [
          request.user.id
        ]);
        sets.push(`is_default = true`);
      }

      if (!sets.length) throw errors.badRequest('没有需要更新的字段');

      sets.push(`updated_at = now()`);
      values.push(request.params.id, request.user.id);
      await query(
        `update cat set ${sets.join(', ')} where id = $${index} and user_id = $${index + 1}`,
        values
      );

      const row = await loadCat(request.user.id, request.params.id);
      const urlMap = await resolveAssetUrls([row.avatar_asset_id]);
      return ok({ cat: serialize(row, urlMap) });
    }
  );

  /**
   * 归档而不是物理删除。产品规范要求「默认不直接删除已生成作品」，
   * 归档后作品仍保留，猫咪不再出现在切换列表。
   */
  app.delete('/:id', async (request) => {
    await loadCat(request.user.id, request.params.id);
    await query(
      `update cat set archived_at = now(), is_default = false, updated_at = now()
       where id = $1 and user_id = $2`,
      [request.params.id, request.user.id]
    );
    return ok({ archived: true });
  });

  app.post('/:id/restore', async (request) => {
    await loadCat(request.user.id, request.params.id);
    await query(
      `update cat set archived_at = null, updated_at = now()
       where id = $1 and user_id = $2`,
      [request.params.id, request.user.id]
    );
    const row = await loadCat(request.user.id, request.params.id);
    const urlMap = await resolveAssetUrls([row.avatar_asset_id]);
    return ok({ cat: serialize(row, urlMap) });
  });

  app.post('/:id/default', async (request) => {
    await loadCat(request.user.id, request.params.id);
    await withTransaction(async (client) => {
      await client.query('update cat set is_default = false where user_id = $1 and is_default', [
        request.user.id
      ]);
      await client.query(
        `update cat set is_default = true, updated_at = now()
         where id = $1 and user_id = $2 and archived_at is null`,
        [request.params.id, request.user.id]
      );
    });
    return ok({ ok: true });
  });

  // ---------- 人格设定（P0.5 底座） ----------
  app.put(
    '/:id/persona',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            pastLifeRole: { type: 'string', maxLength: 128 },
            pastLifeStory: { type: 'string', maxLength: 2000 },
            speechStyle: { type: 'string', maxLength: 500 },
            catchphrase: { type: 'string', maxLength: 128 },
            promptSnippet: { type: 'string', maxLength: 1000 },
            voiceId: { type: 'string', maxLength: 64 },
            status: { type: 'string', enum: ['draft', 'confirmed'] }
          }
        }
      }
    },
    async (request) => {
      await loadCat(request.user.id, request.params.id);
      const b = request.body;

      const result = await query(
        `insert into cat_persona
           (cat_id, past_life_role, past_life_story, speech_style, catchphrase,
            prompt_snippet, voice_id, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (cat_id) do update set
           past_life_role = coalesce(excluded.past_life_role, cat_persona.past_life_role),
           past_life_story = coalesce(excluded.past_life_story, cat_persona.past_life_story),
           speech_style = coalesce(excluded.speech_style, cat_persona.speech_style),
           catchphrase = coalesce(excluded.catchphrase, cat_persona.catchphrase),
           prompt_snippet = coalesce(excluded.prompt_snippet, cat_persona.prompt_snippet),
           voice_id = coalesce(excluded.voice_id, cat_persona.voice_id),
           status = coalesce(excluded.status, cat_persona.status),
           updated_at = now()
         returning *`,
        [
          request.params.id,
          b.pastLifeRole || null,
          b.pastLifeStory || null,
          b.speechStyle || null,
          b.catchphrase || null,
          b.promptSnippet || null,
          b.voiceId || null,
          b.status || 'draft'
        ]
      );
      return ok({ persona: serializePersona(result.rows[0]) });
    }
  );
}

function serializePersona(row) {
  return {
    catId: row.cat_id,
    pastLifeRole: row.past_life_role,
    pastLifeStory: row.past_life_story,
    speechStyle: row.speech_style,
    catchphrase: row.catchphrase,
    promptSnippet: row.prompt_snippet,
    voiceId: row.voice_id,
    status: row.status,
    updatedAt: row.updated_at
  };
}
