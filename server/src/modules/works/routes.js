import { query } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';
import { resolveAssetUrls, resolveVideoAssetRefs } from '../../services/assets.js';

const SERIALIZE_SQL = `
  select w.*,
         j.result->>'mime' as output_mime,
         coalesce(
           (select json_agg(json_build_object('id', c.id, 'name', c.name) order by c.created_at)
            from cat c where c.id = any(w.cat_ids)),
           '[]'::json
         ) as cats
  from work w
  left join generation_job j on j.id = w.job_id
  where w.user_id = $1 and w.deleted_at is null
`;

function serialize(row, urlMap, videoMap = new Map()) {
  const video = row.output_mime === 'video/mp4' ? videoMap.get(row.cover_asset_id) : null;
  return {
    id: row.id,
    jobId: row.job_id,
    templateKey: row.template_key,
    title: row.title,
    body: row.body,
    cats: row.cats || [],
    catIds: row.cat_ids || [],
    cover: row.cover_asset_id
      ? { assetId: row.cover_asset_id, url: urlMap.get(row.cover_asset_id) || null }
      : null,
    media: video,
    visibility: row.visibility,
    outputMime: row.output_mime || null,
    saved: Boolean(row.saved_at),
    createdAt: row.created_at
  };
}

export default async function workRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  /**
   * 作品列表。默认只返回用户保存过的作品；
   * saved=false 时返回「最近生成」，对应 P0 里轻量的最近记录。
   */
  app.get('/', async (request) => {
    const limit = Math.min(Number(request.query?.limit) || 20, 50);
    const savedOnly = request.query?.saved !== 'false';
    const catId = request.query?.catId;
    const before = request.query?.before;

    const conditions = [];
    const values = [request.user.id];
    let index = 2;

    if (savedOnly) conditions.push('w.saved_at is not null');
    if (catId) {
      conditions.push(`$${index} = any(w.cat_ids)`);
      values.push(catId);
      index += 1;
    }
    if (before) {
      conditions.push(`w.created_at < $${index}`);
      values.push(before);
      index += 1;
    }

    values.push(limit);
    const sql = `
      ${SERIALIZE_SQL}
      ${conditions.length ? `and ${conditions.join(' and ')}` : ''}
      order by w.created_at desc
      limit $${index}
    `;

    const result = await query(sql, values);
    const urlMap = await resolveAssetUrls(result.rows.map((row) => row.cover_asset_id), { preview: true });
    const videoMap = await resolveVideoAssetRefs(result.rows.filter((row) => row.output_mime === 'video/mp4').map((row) => row.cover_asset_id));

    return ok({
      items: result.rows.map((row) => serialize(row, urlMap, videoMap)),
      // 简单游标：拿最后一条的 createdAt 作为下一页 before
      nextCursor: result.rows.length === limit ? result.rows[result.rows.length - 1].created_at : null
    });
  });

  app.get('/:id', async (request) => {
    const result = await query(`${SERIALIZE_SQL} and w.id = $2`, [request.user.id, request.params.id]);
    const row = result.rows[0];
    if (!row) throw errors.notFound('作品不存在');
    const urlMap = await resolveAssetUrls([row.cover_asset_id]);
    const videoMap = await resolveVideoAssetRefs(row.output_mime === 'video/mp4' ? [row.cover_asset_id] : []);
    return ok({ work: serialize(row, urlMap, videoMap) });
  });

  /** 用户主动保存：进入作品库，不再受「最近生成」清理影响 */
  app.post('/:id/save', async (request) => {
    const result = await query(
      `update work set saved_at = now()
       where id = $1 and user_id = $2 and deleted_at is null
       returning saved_at`,
      [request.params.id, request.user.id]
    );
    if (!result.rows.length) throw errors.notFound('作品不存在');
    return ok({ saved: true, savedAt: result.rows[0].saved_at });
  });

  app.patch(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            visibility: { type: 'string', enum: ['private', 'unlisted', 'public'] },
            title: { type: 'string', maxLength: 100 }
          }
        }
      }
    },
    async (request) => {
      const sets = [];
      const values = [request.params.id, request.user.id];
      let index = 3;

      if (request.body.visibility) {
        sets.push(`visibility = $${index}`);
        values.push(request.body.visibility);
        index += 1;
      }
      if (request.body.title !== undefined) {
        sets.push(`title = $${index}`);
        values.push(request.body.title);
        index += 1;
      }
      if (!sets.length) throw errors.badRequest('没有需要更新的字段');

      const result = await query(
        `update work set ${sets.join(', ')}
         where id = $1 and user_id = $2 and deleted_at is null
         returning id, visibility, title`,
        values
      );
      if (!result.rows.length) throw errors.notFound('作品不存在');
      return ok({ work: result.rows[0] });
    }
  );

  /** 软删除。保留 30 天，便于用户误删后找回 */
  app.delete('/:id', async (request) => {
    const result = await query(
      `update work set deleted_at = now()
       where id = $1 and user_id = $2 and deleted_at is null
       returning id`,
      [request.params.id, request.user.id]
    );
    if (!result.rows.length) throw errors.notFound('作品不存在');
    return ok({ deleted: true });
  });
}
