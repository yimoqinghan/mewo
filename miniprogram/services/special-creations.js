const { asset } = require('../utils/assets');

const GIF_SKILLS = [
  { id: 'costume-reveal', name: '变装走秀', desc: '一拍变成今日主角', example: asset('special-examples/gif-costume-reveal-v2.gif'), prompt: '先保持原照片中的猫咪姿态半秒，然后在动作节拍点完成一次华丽但自然的变装：服装从简洁日常变成精致舞台造型，猫咪抬头、迈出两步并轻轻回头，最后定格在自信走秀姿势；服装完整贴合身体，不能遮住脸、耳朵和爪子，首尾帧自然循环' },
  { id: 'human-vlog', name: '喵人类 Vlog', desc: '像人一样过一天', example: asset('special-examples/gif-human-vlog-v2.gif'), prompt: '把猫咪拟人化成有鲜明性格的生活 Vlogger：猫咪保持真实猫脸和毛色，穿简洁日常服装，连续完成拿相机自拍、推门、回头看镜头三个动作，镜头有轻微手持感和自然转场，像一段 2 秒的日常短 Vlog，不出现人类手臂或多余人物' },
  { id: 'office-cat', name: '打工猫的一天', desc: '上班、开会、拒绝加班', example: asset('special-examples/gif-office-cat-v2.gif'), prompt: '猫咪变成认真又有点不耐烦的办公室员工，戴小工牌或领结，在桌前敲键盘、看文件、抬眼叹气，最后把爪子轻轻盖住电脑；场景是整洁的小型办公室，动作分成清晰三拍，保持猫咪外貌一致，幽默但不夸张' },
  { id: 'unboxing', name: '猫猫开箱', desc: '拆到惊喜时的反应', example: asset('special-examples/gif-unboxing-v2.gif'), prompt: '设计一个短促有反转的开箱镜头：猫咪先好奇靠近一个小纸箱，伸爪打开盒盖，看到惊喜后耳朵竖起、眼睛放大并开心抖动尾巴；纸箱、道具和猫咪爪子关系清楚，动作连贯，结尾回到好奇姿态' },
  { id: 'midnight-chef', name: '深夜食堂', desc: '今晚由猫主厨掌勺', example: asset('special-examples/gif-midnight-chef-v2.gif'), prompt: '猫咪戴迷你厨师帽和围裙，在暖色小厨房里认真完成闻香、翻锅、端盘三个连续动作，食物只做安全的卡通化蒸汽和香气表现，不让猫咪真的接触热油或火焰；最后猫咪对镜头得意眨眼，画面温暖又有生活感' },
  { id: 'sock-detective', name: '袜子大侦探', desc: '追踪家里神秘失踪物', example: asset('special-examples/gif-sock-detective-v2.gif'), prompt: '猫咪化身小侦探，先低头观察线索，再举起放大镜追踪一只彩色袜子，最后突然转头发现镜头并露出得意表情；用三段式小剧情制造轻微反转，场景保持在家中，猫咪身体结构和花色稳定' },
  { id: 'magic-transform', name: '魔法变身', desc: '从日常变成奇幻主角', example: asset('special-examples/gif-magic-transform-v2.gif'), prompt: '猫咪站在原场景中央，周围出现柔和星尘和手绘魔法光圈，完成一次由日常状态到奇幻角色的连续变身：耳朵抬起、披风出现、尾巴扬起，最后轻轻挥爪；变身必须平滑，不能闪烁、断肢或改变猫咪脸型' },
  { id: 'space-commute', name: '太空通勤', desc: '今天也要去月球上班', example: asset('special-examples/gif-space-commute-v2.gif'), prompt: '猫咪穿轻量宇航服，在小型太空舱里漂浮着完成看导航、抓住扶手、望向舷窗三个动作，窗外有缓慢移动的月球和星星；节奏轻快、镜头稳定，宇航服贴合身体，保留猫咪真实脸部与毛色' },
  { id: 'idol-encore', name: '喵安可', desc: '舞台灯亮起就开始营业', example: asset('special-examples/gif-idol-encore-v2.gif'), prompt: '猫咪站在迷你舞台中央，先低头准备，随后跟着节拍左右踏步、挥爪、向镜头鞠躬，最后灯光闪烁一次并定格；舞台灯光和亮片只做背景点缀，不遮挡猫脸，动作要像一段可循环的谢幕表演' },
  { id: 'rainy-taxi', name: '雨夜出租车', desc: '一段有电影感的小逃离', example: asset('special-examples/gif-rainy-taxi-v2.gif'), prompt: '猫咪坐在雨夜出租车后座，先看窗外的霓虹倒影，再回头看镜头，轻轻把爪子搭在车窗边；雨滴和城市灯光缓慢移动，情绪从安静变成温柔期待，保持猫咪外貌稳定，像电影里 2 秒的情绪镜头' }
];

const SHORT_VIDEO_SKILLS = [
  { id: 'video-vlog', name: '喵 Vlog', desc: '像人一样过一天', example: asset('video-examples/meow-vlog.mp4'), stream: asset('video-examples/hls/meow-vlog/index.m3u8'), poster: asset('video-examples/meow-vlog-poster.jpg'), model: 'minimax-h3', prompt: '制作一段竖屏短视频感的猫咪日常：猫咪保持真实猫脸和毛色，背上小包从门口出发，走两步回头对镜头挥爪，再看向远处；镜头像轻微手持的生活 Vlog，动作分成出发、回头、定格三拍，首尾自然循环，不出现人类手臂或多余人物' },
  { id: 'video-costume', name: '变装走秀', desc: '三拍完成角色造型', example: asset('video-examples/cat-costume-reveal.mp4'), stream: asset('video-examples/hls/cat-costume-reveal/index.m3u8'), poster: asset('video-examples/cat-costume-reveal-poster.jpg'), model: 'hailuo-h3-cankaosheng', prompt: '制作一段竖屏宠物变装短片：猫咪先保持原本日常状态，随着节拍完成一次平滑变装，变成精致但轻盈的舞台造型，然后抬头、迈出两步、回头定格；服装贴合身体，不遮挡脸、耳朵和爪子，保留原猫咪花色，首尾自然循环' },
  { id: 'video-midnight-cinema', name: '喵的午夜电影', desc: '一束光，一段电影般的相遇', example: asset('video-examples/cat-midnight-cinema.mp4'), stream: asset('video-examples/hls/cat-midnight-cinema/index.m3u8'), poster: asset('video-examples/cat-midnight-cinema-poster.jpg'), model: 'hailuo-h3-cankaosheng', duration: 5, prompt: '制作一段 5 秒竖屏 9:16 的电影质感猫咪短片：一只黑色猫咪坐在深夜窗边，窗外是虚化的蓝色城市霓虹，室内有一束温暖的侧光。前 1.5 秒猫咪安静看向窗外，镜头缓慢向前推进；接着猫咪听到声音，缓慢转头看向镜头并轻轻眨眼，尾巴在前景柔和掠过；最后停在一个有情绪的眼神上。使用 35mm 电影镜头语言、浅景深、柔和镜头呼吸、低饱和胶片色彩、细腻自然颗粒、体积光和真实毛发细节，运动克制、画面稳定，像电影中的一个安静情绪镜头。保持猫咪脸部、花色、耳朵和身体结构稳定，不出现人类、文字、水印、乱码、额外肢体或夸张变形' },
  { id: 'video-bikini-runway', name: '喵的比基尼秀场', desc: '从后台出场，走到聚光灯中央', example: asset('video-examples/cat-bikini-runway.mp4'), stream: asset('video-examples/hls/cat-bikini-runway/index.m3u8'), poster: asset('video-examples/cat-bikini-runway-poster.jpg'), model: 'hailuo-h3-cankaosheng', duration: 5, prompt: '制作一段 5 秒、竖屏 9:16、内容丰富的猫咪高级时装秀短片：主角保持参考图中的脸型、花色、耳朵和身体比例稳定，穿着黄色与珊瑚粉的比基尼灵感两件式海滩礼服，带轻薄流苏、蝴蝶结和小披肩，服装完整覆盖身体关键部位，儿童友好、可爱时尚、不裸露不情色。0-1 秒后台幕布被灯光照亮，猫咪从幕布后自信走出并整理小披肩；1-2.5 秒沿闪亮白色 T 台向前走秀，镜头低机位平滑跟拍，观众闪光灯在两侧闪烁；2.5-3.8 秒在 T 台中央轻巧转身展示服装细节，尾巴自然摆动并抬爪挥手；3.8-5 秒聚光灯收束，猫咪走到台前做俏皮优雅的定格，背景有少量彩纸和欢呼灯牌光斑。黑色观众席、镜面 T 台、暖白聚光灯、粉金边缘光、浅景深、柔和镜头光晕、细腻毛发与布料纹理、电影级曝光和色彩；不出现清晰人脸、手臂、文字、Logo、水印、乱码、额外肢体或服装穿模' }
];

const EMOJI_SKILLS = [
  { id: 'happy', name: '开心营业', desc: '今天也要闪闪发光', example: asset('special-examples/emoji-happy-v2.webp'), overlay: '好耶！', prompt: '猫咪从平静变成开心营业状态：眼睛弯起、耳朵竖起、两只爪子向前挥动，周围出现少量星星和彩色纸屑，表情明亮但不幼稚，适合聊天表情' },
  { id: 'human-vlog', name: 'Vlog 开场', desc: '大家好我是猫', example: asset('special-examples/emoji-human-vlog-v2.webp'), overlay: '今天也出发！', prompt: '猫咪像人类 Vlogger 一样对着镜头挥爪、整理小背包、露出准备出门的期待表情，构图像短视频开场定格，背景干净，动作和文字清晰，适合聊天表情' },
  { id: 'office-reject', name: '拒绝加班', desc: '老板我先下班了', example: asset('special-examples/emoji-office-reject-v2.webp'), overlay: '不干！', prompt: '猫咪坐在小办公桌前，把爪子坚定地盖在电脑上，眉眼傲娇、尾巴甩一下，桌上有下班时间的小便签，画面有轻微喜剧反差，适合聊天表情' },
  { id: 'gossip', name: '吃瓜震惊', desc: '这瓜保熟吗', example: asset('special-examples/emoji-gossip-v2.webp'), overlay: '诶？！', prompt: '猫咪抱着一片卡通西瓜，眼睛突然睁圆、嘴巴微张，旁边有冲击线和小问号，制造“听到大新闻”的戏剧反应，保持脸部可爱和文字可读' },
  { id: 'angry', name: '气鼓鼓', desc: '有事冲朕来', example: asset('special-examples/emoji-angry-v2.webp'), overlay: '哼！', prompt: '猫咪轻微生气又不吓人：耳朵向后、脸颊鼓起、爪子叉腰或挡在身前，头顶有小火苗和气泡点缀，表情夸张但保持真实猫咪外貌' },
  { id: 'sleepy', name: '困到断电', desc: '先睡五分钟再说', example: asset('special-examples/emoji-sleepy-v2.webp'), overlay: 'Zzz…', prompt: '猫咪困得像要断电：眼睛半闭、身体软绵绵趴下，头顶漂浮 Zzz 和小月亮，嘴角带一点满足感，画面留白充足，适合聊天表情' },
  { id: 'love', name: '想你了', desc: '把心意发给两脚兽', example: asset('special-examples/emoji-love-v2.webp'), overlay: '想你♡', prompt: '猫咪抱住一颗大爱心或把爪子伸向镜头，眼神温柔又有一点撒娇，少量心形和柔光点缀，不能遮住猫脸，适合聊天表情' },
  { id: 'unboxing', name: '拆箱惊喜', desc: '这也太会了吧', example: asset('special-examples/emoji-unboxing-v2.webp'), overlay: '收到！', prompt: '猫咪从小纸箱里探头，双爪抱住刚拆出的礼物，眼睛发亮、尾巴翘起，周围有彩带和惊叹号，重点突出“拆开后惊喜”的瞬间，适合聊天表情' },
  { id: 'sorry', name: '猫猫道歉', desc: '下次还敢但先认错', example: asset('special-examples/emoji-sorry-v2.webp'), overlay: '对不起嘛', prompt: '猫咪双爪合十或低头认错，耳朵微微下垂，身旁有小小的道歉花束和汗滴，整体是可爱而不苦情的轻喜剧表情，文字清晰' },
  { id: 'waiting', name: '已读等回复', desc: '怎么还不回我', example: asset('special-examples/emoji-waiting-v2.webp'), overlay: '在吗？', prompt: '猫咪抱着手机坐着等待，先看屏幕再抬头望向镜头，头顶出现三个等待小点和小钟表，情绪是委屈又克制的撒娇，适合聊天表情' }
];

function getDefaultExpressionText(skill) { return skill?.overlay || ''; }

function getSpecialSkills(type, mode) {
  if (mode === 'short-video') return SHORT_VIDEO_SKILLS;
  return type === 'emoji' ? EMOJI_SKILLS : GIF_SKILLS;
}

module.exports = { GIF_SKILLS, EMOJI_SKILLS, SHORT_VIDEO_SKILLS, getSpecialSkills, getDefaultExpressionText };
