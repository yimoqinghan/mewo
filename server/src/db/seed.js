import { pool, closePool } from './pool.js';

/**
 * 17 个生成模板与产品规划《产品功能规划 V1.0》4.2 保持一致。
 * config 里只放「提示词骨架」这类可运营调整的内容，
 * 图片尺寸、风格、成本都在数据库里改，不需要发版。
 */
const TEMPLATES = [
  {
    key: 'today',
    name: '今日喵事',
    description: '把猫咪今天最想炫耀的一件小事做成图文卡片',
    config: {
      aspectRatio: '1:1',
      promptHint: '把这只猫今天的一件小事做成一张温暖治愈的图文卡片，画面要有明确主标题留白区',
      stylePrompt: '柔和自然光，生活感插画质感，色彩温暖'
    }
  },
  {
    key: 'news',
    name: '猫咪新闻',
    description: '突发新闻：这只猫又干了什么',
    config: {
      aspectRatio: '4:3',
      promptHint: '生成一张突发新闻播报画面，将这只猫作为新闻主角，带新闻台标题条构图',
      stylePrompt: '新闻演播室灯光，严肃中带荒诞喜感'
    }
  },
  {
    key: 'monologue',
    name: '猫咪独白',
    description: '猫咪心里没说出口的那句话',
    config: {
      aspectRatio: '3:4',
      promptHint: '呈现这只猫安静的独处瞬间，为它的内心独白预留文字区域',
      stylePrompt: '低饱和电影感，窗边侧光，情绪克制'
    }
  },
  {
    key: 'observer',
    name: '两脚兽观察日记',
    description: '以猫的视角记录主人',
    config: {
      aspectRatio: '1:1',
      promptHint: '从猫咪的低视角仰视人类，呈现猫咪观察主人的日常场景',
      stylePrompt: '广角低机位，室内暖色调'
    }
  },
  {
    key: 'voice',
    name: '猫咪语音吐槽',
    description: '首版输出文字版吐槽，语音能力后续接入',
    config: {
      aspectRatio: '1:1',
      promptHint: '生成猫咪叉腰吐槽的表情特写，预留吐槽气泡文字区',
      stylePrompt: '夸张漫画表情，明快撞色'
    }
  },
  {
    key: 'mood',
    name: '情绪卡片',
    description: '今日猫咪情绪状态卡',
    config: {
      aspectRatio: '1:1',
      promptHint: '把这只猫当前的情绪做成一张情绪卡片，含情绪关键词和色彩氛围',
      stylePrompt: '低饱和莫兰迪色，柔软颗粒质感'
    }
  },
  {
    key: 'quote',
    name: '猫咪语录',
    description: '一句像这只猫会说的话',
    config: {
      aspectRatio: '4:3',
      promptHint: '生成极简留白画面，猫咪居中偏侧，大面积留白用于排布语录文字',
      stylePrompt: '极简摄影，纯净背景，高级灰'
    }
  },
  {
    key: 'id',
    name: '猫咪身份证',
    description: '家庭成员身份卡',
    config: {
      aspectRatio: '3:4',
      promptHint: '生成一张正式证件卡版式的猫咪身份卡，包含头像框、信息栏、编号区',
      stylePrompt: '证件卡设计感，规整网格，鲜明主色'
    }
  },
  {
    key: 'milestone',
    name: '成长纪念卡',
    description: '记录一个值得记住的节点',
    config: {
      aspectRatio: '3:4',
      promptHint: '生成纪念卡片构图，猫咪为主体，含日期与纪念文案区',
      stylePrompt: '复古胶片质感，柔和暖光'
    }
  },
  {
    key: 'magazine',
    name: '杂志封面',
    description: '这本猫登上封面了',
    config: {
      aspectRatio: '3:4',
      promptHint: '生成时尚杂志封面构图，猫咪为封面人物，预留刊名与期号排版区',
      stylePrompt: '高级时装大片，硬光造型感'
    }
  },
  {
    key: 'poster',
    name: '电影海报',
    description: '一部以这只猫为主角的电影',
    config: {
      aspectRatio: '2:3',
      promptHint: '生成电影海报构图，猫咪为绝对主角，含片名与演职员信息排版区',
      stylePrompt: '戏剧性打光，强烈色彩对比，电影级质感'
    }
  },
  {
    key: 'wanted',
    name: '猫咪通缉令',
    description: '通缉：可爱到让人无法工作',
    config: {
      aspectRatio: '3:4',
      promptHint: '生成复古西部通缉令海报，猫咪正面照居中，上下为通缉文字区',
      stylePrompt: '做旧牛皮纸，粗糙印刷质感'
    }
  },
  {
    key: 'comic',
    name: '猫咪四格漫画',
    description: '四格分镜讲述一个小故事',
    config: {
      aspectRatio: '1:1',
      promptHint: '生成严格四格分镜漫画，同一只猫贯穿四格，情节连贯，含对话气泡',
      stylePrompt: '日系清晰线条，明亮平涂上色'
    }
  },
  {
    key: 'chat',
    name: '人猫聊天截图',
    description: '像一场真的对话',
    config: {
      aspectRatio: '9:16',
      promptHint: '生成即时通讯聊天界面截图构图，人猫对话气泡交替',
      stylePrompt: '拟真 App 界面，干净 UI 风格'
    }
  },
  {
    key: 'theater',
    name: '人猫小剧场',
    description: '一幕关于这只猫的小短剧',
    config: {
      aspectRatio: '16:9',
      promptHint: '生成舞台剧照构图，猫咪与主人同框演出，含幕次字幕区',
      stylePrompt: '舞台聚光灯，戏剧布景，电影感'
    }
  },
  {
    key: 'serial',
    name: '人猫双图连续漫画',
    description: '两格连续叙事',
    config: {
      aspectRatio: '3:4',
      promptHint: '生成上下两格连续漫画，上下镜头为同一场景的前后两个瞬间',
      stylePrompt: '连贯分镜，统一色调'
    }
  },
  {
    key: 'shape',
    name: '异形创意猫咪图',
    description: '首版主推：非常规轮廓的创意形象',
    config: {
      aspectRatio: '1:1',
      promptHint:
        '生成非常规轮廓的异形创意猫咪形象，轮廓适合裁切成贴纸或挂件，主体居中，纯色或极简背景',
      stylePrompt: '高饱和撞色，干净描边，便于去背'
    },
    minCats: 1,
    maxCats: 3
  },
  {
    key: 'ai-image',
    name: 'AI 图片创作',
    description: '通过文字描述、参考图和专业参数生成图片，不绑定宠物档案',
    config: {
      aspectRatio: '1:1',
      promptHint: '根据创作者的描述生成一张完整、有明确主体和构图的图片'
    },
    minCats: 0,
    maxCats: 0
  }
];

async function main() {
  let index = 0;
  for (const item of TEMPLATES) {
    index += 1;
    await pool.query(
      `insert into generation_template
         (key, name, category, description, config, credits_cost, min_cats, max_cats, enabled, sort_order)
       values ($1, $2, 'image', $3, $4::jsonb, $5, $6, $7, true, $8)
       on conflict (key) do update set
         name = excluded.name,
         description = excluded.description,
         config = excluded.config,
         credits_cost = excluded.credits_cost,
         min_cats = excluded.min_cats,
         max_cats = excluded.max_cats,
         sort_order = excluded.sort_order,
         enabled = true`,
      [
        item.key,
        item.name,
        item.description,
        JSON.stringify(item.config),
        item.creditsCost ?? 1,
        item.minCats ?? 1,
        item.maxCats ?? 1,
        index * 10
      ]
    );
  }
  console.log(`[seed] 已同步 ${TEMPLATES.length} 个生成模板`);
  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
