const TOP_CHAT_MODELS = [
  { id: 'kimi-k3', name: 'Kimi K3', provider: '月之暗面', badge: '榜 1', desc: '深度思考 · 长上下文' },
  // 展示名称沿用榜单，id 使用 api.lk888.ai 实际可调用的模型 ID。
  { id: 'tt-6-luna', name: '混元 4', provider: '腾讯混元', badge: '榜 2', desc: '中文表达 · 日常陪伴' },
  { id: 'qwen4-max', name: '千问 4 Max', provider: '阿里云千问', badge: '榜 3', desc: '复杂推理 · 专业写作' },
  { id: 'hy4-flash', name: '混元 4 Flash', provider: '腾讯混元', badge: '榜 4', desc: '响应轻快 · 高性价比' },
  { id: 'kimi-k3.1-pro', name: 'Kimi K3.1 Pro', provider: '月之暗面', badge: '榜 5', desc: '旗舰思考 · 视觉理解' },
  { id: 'deepseek-v4.1-flash', name: 'DS-V4.1-Flash', provider: 'DeepSeek', badge: '榜 6', desc: '高吞吐 · 通用对话' }
];

function listValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('、');
  return String(value || '').replace(/\s*·\s*/g, '、');
}

function personaText(cat) {
  const traits = listValue(cat.traits);
  const likes = listValue(cat.likes);
  const dislikes = listValue(cat.dislikes);
  return [
    cat.personality ? `性格：${cat.personality}` : '',
    traits ? `外貌与特征：${traits}` : '',
    likes ? `喜欢：${likes}` : '',
    dislikes ? `不喜欢：${dislikes}` : ''
  ].filter(Boolean).join('；');
}

module.exports = { TOP_CHAT_MODELS, personaText };
