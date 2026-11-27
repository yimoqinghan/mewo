import crypto from 'node:crypto';
import { query } from '../../db/pool.js';
import { ok, errors } from '../../lib/errors.js';

function demoVideoResult(catName = '这只喵') {
  return {
    mode: 'mock',
    title: '想靠近你',
    summary: `${catName}这段表现更像是在主动邀请互动：它愿意靠近，也在观察你的回应。`,
    signals: [
      { label: '动作', value: '身体放松，尾巴轻轻上扬' },
      { label: '声音', value: '短促、重复的叫声，情绪偏积极' },
      { label: '可能诉求', value: '想玩一会儿，或希望你回应它' }
    ],
    confidence: 82,
    suggestion: '可以先轻声回应，再把玩具放到它面前，观察它是否继续靠近。',
    disclaimer: '这是基于视频特征的趣味推测，不是医疗诊断，也不能替代兽医判断。'
  };
}

function demoAudioResult(catName = '这只喵') {
  return {
    mode: 'mock',
    title: '在叫你过去',
    summary: `${catName}这段叫声更像是在主动呼唤你，语气里有一点期待，也可能是在提醒你注意它。`,
    signals: [
      { label: '声音', value: '短促、连续的叫声，音量较稳定' },
      { label: '情绪', value: '偏积极，带有等待回应的感觉' },
      { label: '可能诉求', value: '想让你看它一眼，或陪它互动一会儿' }
    ],
    confidence: 76,
    suggestion: '先回应它的名字，再观察它接下来往哪里走，不要只根据叫声判断需求。',
    disclaimer: '这是基于声音特征的趣味推测，不是医疗诊断，也不能替代兽医判断。'
  };
}

export default async function catTranslationRoutes(app) {
  app.addHook('preHandler', app.authenticate);

  app.post(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['assetId'],
          additionalProperties: false,
          properties: {
            catId: { type: 'string', format: 'uuid' },
            assetId: { type: 'string', format: 'uuid' },
            kind: { type: 'string', enum: ['video', 'image', 'audio'] }
          }
        }
      }
    },
    async (request) => {
      const { catId, assetId, kind = 'video' } = request.body;
      const asset = await query(
        `select id, mime, status from asset where id = $1 and owner_user_id = $2`,
        [assetId, request.user.id]
      );
      if (!asset.rows.length || asset.rows[0].status !== 'ready') throw errors.badRequest(kind === 'audio' ? '录音尚未上传完成，请重试' : '视频尚未上传完成，请重试');
      const mime = asset.rows[0].mime;
      const validAudio = mime.startsWith('audio/');
      const validImage = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
      if (kind === 'audio' ? !validAudio : kind === 'image' ? !validImage : mime !== 'video/mp4') {
        throw errors.badRequest(kind === 'audio' ? '暂时只支持音频录音' : kind === 'image' ? '暂时只支持 JPG、PNG 或 WebP 图片' : '暂时只支持 MP4 视频');
      }

      let catName = '这只喵';
      if (catId) {
        const cat = await query(
          `select name from cat where id = $1 and user_id = $2 and archived_at is null`,
          [catId, request.user.id]
        );
        if (!cat.rows.length) throw errors.notFound('猫咪档案不存在');
        catName = cat.rows[0].name;
      }

      // 当前预览版使用可替换的 mock 分析器；真实多模态模型接入时只替换此处，
      // 客户端仍保持“提交 → 分析 → 结果”的状态机和隐私边界。
      return ok({
        jobId: crypto.randomUUID(),
        status: 'succeeded',
        progress: 100,
        result: kind === 'audio' ? demoAudioResult(catName) : demoVideoResult(catName)
      });
    }
  );
}
