/**
 * 纯文案类结果的模板文案。
 * 首版图片为主，文案作为作品正文附带；后续接入语音吐槽时复用这里。
 */
const TEXTS = {
  today: (cat) => `${cat.name} 今日营业：负责可爱，拒绝加班。`,
  news: (cat) => `突发新闻：${cat.name} 再次成功占领了家里最舒服的位置。`,
  monologue: () => '我没有一直看着你，我只是在确认你有没有好好回家。',
  observer: () => '两脚兽今天看起来有点累，本喵决定允许她摸我三分钟。',
  voice: () => '人类，先把今天的烦恼放下，再给本喵开个罐头。',
  mood: (cat) => `${cat.name} 的今日情绪：软绵绵地陪着你。`,
  quote: () => '“我不是高冷，我只是把热情留给值得的人类。”',
  id: (cat) => `${cat.name}，家庭成员，擅长卖萌和占领沙发。`,
  milestone: (cat) => `今天也和${cat.name}一起，把普通日子过得可爱一点。`,
  magazine: (cat) => `${cat.name} 本期专题：如何优雅地统治一个家。`,
  poster: (cat) => `《${cat.name}：最后一根猫薄荷的守护者》`,
  wanted: () => '通缉：一只可爱到让人无法正常工作的猫。',
  comic: () => '四格预告：回家、对视、撒娇、一起躺平。',
  chat: (cat) => `你：今天辛苦了。\n${cat.name}：知道了，先抱一下。`,
  theater: (cat) => `第一幕：主人推门回家，${cat.name}假装没有等她。`,
  serial: (cat) => `《我和${cat.name}的同居生活》第一话：沙发归属权争夺战。`,
  shape: (cat) => `${cat.name} 已进入异形创意模式：一只会发光的家庭小宇宙。`
};

export function generatedText(templateKey, cat) {
  const builder = TEXTS[templateKey];
  if (builder) return builder(cat);
  return cat?.name ? `${cat.name} 的专属作品已经生成。` : '你的 AI 创作已经生成。';
}
