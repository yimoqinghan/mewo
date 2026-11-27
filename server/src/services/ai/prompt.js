const SIZE_BY_RATIO = {
  '1:1': '2048x2048',
  '3:4': '1728x2304',
  '4:3': '2304x1728',
  '2:3': '1664x2496',
  '3:2': '2496x1664',
  '9:16': '1440x2560',
  '16:9': '2560x1440'
};

const GLOBAL_NEGATIVE =
  '多余的肢体、畸变的脸部、多余的猫、文字乱码、水印、低清晰度、过度锐化、卡通贴纸堆叠';

/**
 * 把「模板骨架 + 猫咪档案 + 人格设定」拼成最终提示词。
 *
 * 关键产品约束：同一只猫反复生成要尽量保持外貌与角色一致。
 * 所以每次都把稳定的外貌描述（花色、体型、特征）放在提示词最前面，
 * 并且要求模型以输入照片作为唯一的形象参考。
 */
export function buildPrompt({ template, cats, personas = [], options = {} }) {
  const config = template.config || {};
  const primary = cats[0];
  const extra = cats.slice(1);

  const appearance = primary ? describeCat(primary) : '主体以输入参考图为准；如果没有参考图，则按照创作者的文字描述设计主体。';
  const extraText = extra.length
    ? `画面中还需要出现：${extra.map((cat) => describeCat(cat)).join('；')}。`
    : '';

  const persona = personas[0];
  const personaText = persona
    ? `角色设定：${[persona.past_life_role, persona.speech_style, persona.catchphrase]
        .filter(Boolean)
        .join('，')}。`
    : '';

  const sections = [
    config.promptHint || '为这只猫生成一张有创意的作品。',
    `主体要求：${appearance}`,
    personaText,
    extraText,
    config.stylePrompt ? `视觉风格：${config.stylePrompt}。` : '',
    options.skillPrompt ? `创作 Skill：${options.skillPrompt}。` : '',
    options.prompt ? `创作者描述：${options.prompt}。` : '',
    options.professionalPrompt ? `专业补充要求：${options.professionalPrompt}。` : '',
    options.mood ? `情绪基调：${options.mood}。` : '',
    options.text ? `需要出现的文字（请保持中文字形正确）：${options.text}。` : '',
    cats.length ? '要求：严格以参考照片中的猫咪外貌为准，保持毛色、花纹、眼睛颜色一致；画面中只出现指定数量的猫。' : '要求：画面主体清晰，构图完整，严格执行创作者描述，不添加无关主体。'
  ].filter(Boolean);

  return {
    prompt: sections.join('\n'),
    negativePrompt: options.negativePrompt || GLOBAL_NEGATIVE,
    size: options.size || SIZE_BY_RATIO[options.aspectRatio] || SIZE_BY_RATIO[config.aspectRatio] || '2048x2048'
  };
}

function describeCat(cat) {
  const parts = [
    cat.name ? `名叫「${cat.name}」` : '',
    cat.breed || '',
    cat.coat || '',
    Array.isArray(cat.traits) && cat.traits.length ? cat.traits.join('、') : '',
    cat.personality || ''
  ].filter(Boolean);
  return parts.join('，') || '一只家猫';
}
