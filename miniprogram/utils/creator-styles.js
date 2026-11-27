const { asset } = require('./assets');

const CREATOR_STYLES = [
  { id: 'sticker-pop', name: '贴纸潮玩', shortName: '贴纸', desc: '适合头像、贴纸和周边', promptText: '把这只猫设计成一张可以直接分享的潮玩贴纸：主体完整，轮廓清楚，带一点俏皮配件和手账贴纸质感。', prompt: '潮玩贴纸视觉，主体轮廓清晰，边缘干净，留出适合裁切的安全边距', example: asset('style-examples/sticker-pop.webp') },
  { id: 'editorial', name: '杂志大片', shortName: '杂志', desc: '高级感封面构图', promptText: '把这只猫拍成一张时尚杂志封面：有明确主题、大片光线和可留标题的构图，像一个刚出道的猫咪明星。', prompt: '时尚杂志大片，画面有明确的视觉中心和留白排版区，质感高级', example: asset('style-examples/editorial.webp') },
  { id: 'orange-red-lab', name: '橙红实验', shortName: '橙红', desc: '高对比情绪海报', promptText: '把这只猫拍成一张橙红色情绪海报：用强烈的红橙逆光勾勒轮廓，保留眼睛和胡须的细节，让深色毛发融入浓郁的暗部；画面有一点速度感和实验摄影的拖影，主体突出，底部留出简洁的标题空间。', prompt: '橙红实验摄影，黑猫侧脸，高对比红橙逆光，深色暗部，细腻毛发与眼睛高光，轻微运动拖影，电影海报构图，底部留白', example: asset('style-examples/orange-red-lab.webp') },
  { id: 'storybook', name: '童话绘本', shortName: '绘本', desc: '柔和、温暖、有故事', promptText: '把这只猫放进一个有开场和情绪的童话场景：它是故事主角，周围有一件小道具和一处温暖的光，让画面像绘本的一页。', prompt: '温暖的童话绘本插画，柔和自然光，细腻纸张纹理，画面有故事感', example: asset('style-examples/storybook.webp') },
  { id: 'cinema', name: '电影海报', shortName: '海报', desc: '强氛围、强叙事', promptText: '把这只猫设计成一张有剧情的电影海报：给它一个明确的身份和正在发生的事情，前景有线索，背景有氛围，画面一眼能让人想知道后续。', prompt: '电影海报构图，戏剧性光影，主体突出，色彩有层次，具有叙事张力', example: asset('style-examples/cinema.webp') },
  { id: 'social-avatar', name: '社交头像', shortName: '头像', desc: '适合头像与个人主页', promptText: '把这只猫做成一张一眼认得出的社交头像：突出它的性格和招牌表情，背景简洁但有一个小记忆点，缩小后仍然醒目。', prompt: '社交头像构图，主体居中，主体清晰，背景简洁，缩小后仍然醒目', example: asset('style-examples/social-avatar.webp') },
  { id: 'ink-style', name: '东方水墨', shortName: '水墨', desc: '留白与东方气韵', promptText: '把这只猫放入一幅有呼吸感的东方画面：用留白、风、纸张和一件小物件讲出它的气质，不堆叠装饰，让主体像一枚印章一样醒目。', prompt: '东方水墨与现代平面设计结合，克制留白，墨色层次丰富，画面雅致', example: asset('style-examples/ink-style.webp') }
];

function getEnabledStyleIds(savedIds) {
  const ids = Array.isArray(savedIds) ? savedIds : [];
  return ids.length ? ids : CREATOR_STYLES.map((item) => item.id);
}

function withEnabled(savedIds) {
  const enabled = new Set(getEnabledStyleIds(savedIds));
  return CREATOR_STYLES.map((item) => ({ ...item, enabled: enabled.has(item.id) }));
}

module.exports = { CREATOR_STYLES, getEnabledStyleIds, withEnabled };
