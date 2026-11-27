const { asset } = require('../utils/assets');

const templates = [
  { key: 'today', name: '今日喵事', icon: '✦' },
  { key: 'news', name: '猫咪新闻', icon: '▣' },
  { key: 'monologue', name: '猫咪独白', icon: '◌' },
  { key: 'observer', name: '两脚兽观察日记', icon: '◉' },
  { key: 'voice', name: '猫咪语音吐槽', icon: '◒' },
  { key: 'mood', name: '情绪卡片', icon: '♡' },
  { key: 'quote', name: '猫咪语录', icon: '“' },
  { key: 'id', name: '猫咪身份证', icon: '▤' },
  { key: 'milestone', name: '成长纪念卡', icon: '★' },
  { key: 'magazine', name: '杂志封面', icon: '▥' },
  { key: 'poster', name: '电影海报', icon: '▶' },
  { key: 'wanted', name: '猫咪通缉令', icon: '!' },
  { key: 'comic', name: '猫咪四格漫画', icon: '▦' },
  { key: 'chat', name: '人猫聊天截图', icon: '☏' },
  { key: 'theater', name: '人猫小剧场', icon: '◎' },
  { key: 'serial', name: '人猫双图连续漫画', icon: '▧' },
  { key: 'shape', name: '异形创意猫咪图', icon: '✧' }
];

function getTemplates() {
  return templates;
}

function createWork(cat, template, photoPath) {
  const messages = {
    today: `${cat.name} 今日营业：负责可爱，拒绝加班。`,
    news: `突发新闻：${cat.name} 再次成功占领了家里最舒服的位置。`,
    monologue: `我没有一直看着你，我只是在确认你有没有好好回家。`,
    observer: `两脚兽今天看起来有点累，本喵决定允许她摸我三分钟。`,
    voice: `人类，先把今天的烦恼放下，再给本喵开个罐头。`,
    mood: `${cat.name} 的今日情绪：软绵绵地陪着你。`,
    quote: `“我不是高冷，我只是把热情留给值得的人类。”`,
    id: `${cat.name}，家庭成员，擅长卖萌和占领沙发。`,
    milestone: `今天也和${cat.name}一起，把普通日子过得可爱一点。`,
    magazine: `${cat.name} 本期专题：如何优雅地统治一个家。`,
    poster: `《${cat.name}：最后一根猫薄荷的守护者》`,
    wanted: `通缉：一只可爱到让人无法正常工作的猫。`,
    comic: `四格预告：回家、对视、撒娇、一起躺平。`,
    chat: `你：今天辛苦了。\n${cat.name}：知道了，先抱一下。`,
    theater: `第一幕：主人推门回家，${cat.name}假装没有等她。`,
    serial: `《我和${cat.name}的同居生活》第一话：沙发归属权争夺战。`,
    shape: `${cat.name} 已进入异形创意模式：一只会发光的家庭小宇宙。`
  };

  return {
    id: `work-${Date.now()}`,
    catId: cat.id,
    catName: cat.name,
    templateKey: template.key,
    templateName: template.name,
    title: template.name,
    text: messages[template.key] || `${cat.name} 的专属作品已经生成。`,
    image: photoPath || cat.avatar || asset('brand-cat.png'),
    createdAt: Date.now()
  };
}

module.exports = {
  getTemplates,
  createWork
};
