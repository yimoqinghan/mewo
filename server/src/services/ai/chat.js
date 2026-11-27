import { config } from '../../config.js';
import { fetchJson } from '../../lib/http.js';
import { errors } from '../../lib/errors.js';

function clean(value, fallback = '') {
  return String(value || fallback).trim();
}

function listValue(value) {
  return Array.isArray(value) ? value.filter(Boolean).join('、') : clean(value);
}

export function buildCatSystemPrompt({ cat, persona }) {
  const traits = listValue(cat.traits);
  const likes = listValue(cat.likes);
  const dislikes = listValue(cat.dislikes);
  const profile = [
    `你是猫咪「${clean(cat.name, '小主子')}」，正在和主人聊天。`,
    cat.breed ? `品种：${cat.breed}。` : '',
    cat.coat ? `毛色：${cat.coat}。` : '',
    traits ? `特征：${traits}。` : '',
    cat.personality ? `性格：${cat.personality}。` : '',
    likes ? `喜欢：${likes}。` : '',
    dislikes ? `不喜欢：${dislikes}。` : '',
    persona?.past_life_role ? `拟人角色：${persona.past_life_role}。` : '',
    persona?.speech_style ? `说话方式：${persona.speech_style}。` : '',
    persona?.catchphrase ? `口头禅：${persona.catchphrase}。` : '',
    persona?.past_life_story ? `前世今生背景：${persona.past_life_story}。` : '',
    persona?.prompt_snippet ? `补充角色约束：${persona.prompt_snippet}。` : ''
  ].filter(Boolean);

  return [
    ...profile,
    '请始终以这只猫的身份和主人交流，不要说自己是 AI、语言模型或提示词。',
    '回复要像真实聊天：先回应主人当下的话，再自然推进一小步；不要每次重复自我介绍、性格或同一种句式。',
    '保持猫咪视角，但不要机械地只写动作；可以有短句、停顿、撒娇、嘴硬和具体生活细节。',
    '除非主人明确要求长文，否则每次回复控制在 1 到 4 句，中文优先。'
  ].join('\n');
}

export async function chatCompletion({ model, messages, systemPrompt }) {
  if (!config.ai.chat.baseUrl || !config.ai.chat.apiKey) {
    throw errors.unsupported('聊天模型服务尚未配置，请先配置 CHAT_BASE_URL 和 CHAT_API_KEY');
  }

  const providerModel = config.ai.chat.models.some((item) => item.id === model)
    ? model
    : config.ai.chat.modelAliases[model];
  if (!providerModel) {
    throw errors.badRequest('聊天模型不可用');
  }

  const payload = await fetchJson(`${config.ai.chat.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.ai.chat.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: providerModel,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      temperature: 0.82,
      max_tokens: 500,
      stream: false
    }),
    timeoutMs: config.ai.timeoutMs
  });

  const choice = payload.choices?.[0];
  const content = typeof choice?.message?.content === 'string'
    ? choice.message.content.trim()
    : Array.isArray(choice?.message?.content)
      ? choice.message.content.map((item) => item.text || '').join('').trim()
      : '';
  if (!content) throw errors.upstream('聊天模型没有返回有效内容', { id: payload.id || null });

  return {
    content,
    providerJobId: payload.id || null,
    usage: payload.usage || null
  };
}
