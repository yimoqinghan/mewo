const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');

const FORTUNES = [
  {
    level: '上上签',
    sign: '云开见喵',
    symbol: '☼',
    text: '你问的事正在从模糊走向清晰。先迈出一小步，好消息会在路上主动找你。',
    good: '主动沟通 · 整理计划 · 晒一张猫片',
    avoid: '反复内耗 · 熬夜硬撑'
  },
  {
    level: '上签',
    sign: '花影入窗',
    symbol: '✦',
    text: '今天的运气像一束斜进窗边的光，温柔但很确定。把喜欢的事做得认真一点，就会有回应。',
    good: '表达心意 · 换个环境 · 记录灵感',
    avoid: '把话憋在心里 · 急着求结果'
  },
  {
    level: '中上签',
    sign: '金铃有声',
    symbol: '♢',
    text: '你已经握住了关键线索，只差一次轻轻的确认。听听身边人的建议，再相信自己的直觉。',
    good: '核对细节 · 请教前辈 · 早点休息',
    avoid: '冲动下决定 · 同时开始太多事'
  },
  {
    level: '上签',
    sign: '月下相逢',
    symbol: '☾',
    text: '有些缘分不必用力追，留一点空间，反而更容易遇见合适的答案。今晚适合慢下来。',
    good: '散步放空 · 温柔聊天 · 整理房间',
    avoid: '过度猜测 · 把沉默当答案'
  },
  {
    level: '中签',
    sign: '小喵守门',
    symbol: '●',
    text: '这是一张提醒你稳住节奏的签。事情没有变坏，只是需要多一点耐心和一份备用计划。',
    good: '拆解任务 · 留有余地 · 补充能量',
    avoid: '临时起意 · 把自己逼太紧'
  },
  {
    level: '中上签',
    sign: '风来有信',
    symbol: '≈',
    text: '新的消息正在靠近。不要一直盯着门口，去做手边最重要的事，风自然会把答案带来。',
    good: '发出邀请 · 完成收尾 · 保持好奇',
    avoid: '频繁刷新 · 轻信未经确认的消息'
  }
];

const pageAssets = {
  cat: asset('fortune/fortune-cat.webp')
};

function hashQuestion(question) {
  return String(question || '').split('').reduce((sum, char, index) => (sum + char.charCodeAt(0) * (index + 3)) % 100000, 17);
}

Page({
  data: {
    assets: pageAssets,
    status: 'ask',
    question: '',
    questionLength: 0,
    castingStep: 0,
    result: null,
    error: ''
  },

  onQuestionInput(event) {
    const question = String(event.detail?.value || '').slice(0, 60);
    this.setData({ question, questionLength: question.length, error: '' });
  },

  askFortune() {
    const question = String(this.data.question || '').trim();
    if (!question) {
      this.setData({ error: '先把心里的问题告诉喵老仙吧' });
      adapter.showToast('先写下你的问题');
      return;
    }
    if (this.data.status === 'casting') return;

    this.clearCastingTimers();
    this.setData({ status: 'casting', castingStep: 0, result: null, error: '' });
    this.castingTimers = [
      setTimeout(() => this.setData({ castingStep: 1 }), 620),
      setTimeout(() => this.setData({ castingStep: 2 }), 1320),
      setTimeout(() => this.setData({ castingStep: 3 }), 2040),
      setTimeout(() => {
        const result = FORTUNES[hashQuestion(question) % FORTUNES.length];
        this.setData({ status: 'result', result, castingStep: 4 });
      }, 2860)
    ];
  },

  resetFortune() {
    this.clearCastingTimers();
    this.setData({ status: 'ask', castingStep: 0, result: null, error: '' });
  },

  clearCastingTimers() {
    (this.castingTimers || []).forEach((timer) => clearTimeout(timer));
    this.castingTimers = [];
  },

  goBack() {
    adapter.navigateBack();
  },

  onUnload() {
    this.clearCastingTimers();
  }
});
