import 'dotenv/config';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateVideo } from '../src/services/ai/video.js';
import { fetchBuffer } from '../src/lib/http.js';
import { packageVideoToHls } from '../src/services/video-hls.js';

const execFileAsync = promisify(execFile);
const execRoot = path.resolve(fileURLToPath(new URL('../public/assets/video-examples/', import.meta.url)));
const slug = 'cat-bikini-runway';
const mp4Path = path.join(execRoot, `${slug}.mp4`);
const posterPath = path.join(execRoot, `${slug}-poster.jpg`);
const hlsRoot = path.join(execRoot, 'hls', slug);
const sourceUrl = process.env.VIDEO_EXAMPLE_SOURCE_URL
  || 'https://static.missmeow.net/static/design-webp/cat-menu-perched.webp';

const prompt = [
  '制作一段 5 秒、竖屏 9:16、内容丰富的猫咪高级时装秀短片。',
  '主角是一只真实可爱的猫咪，保持参考图中的脸型、花色、耳朵和身体比例稳定。',
  '猫咪穿着一套色彩明亮的比基尼灵感时装秀造型：黄色与珊瑚粉的精致两件式海滩礼服，带轻薄流苏、蝴蝶结和小披肩，服装完整覆盖身体关键部位，整体是儿童友好的宠物时装设计，不裸露、不情色、不做挑逗姿势。',
  '镜头按连续的四拍完成小故事：0-1 秒后台幕布被灯光照亮，猫咪从幕布后自信走出并整理一下小披肩；1-2.5 秒猫咪沿着闪亮的白色 T 台向前走秀，镜头低机位平滑跟拍，观众闪光灯在两侧闪烁；2.5-3.8 秒猫咪在 T 台中央轻巧转身，展示服装细节，尾巴自然摆动并抬爪向观众挥手；3.8-5 秒聚光灯收束，猫咪走到台前做一个俏皮但优雅的定格，背景出现少量彩纸和欢呼灯牌的光斑，结尾画面稳定便于循环。',
  '秀场要有真实的高级时装周氛围：黑色观众席、镜面 T 台、暖白聚光灯、粉金边缘光、浅景深、柔和镜头光晕、细腻毛发和布料纹理、电影级曝光与色彩，画面节奏明快但动作自然连贯。',
  '只出现猫咪和抽象化的观众光斑，不出现清晰人脸、手臂、文字、品牌 Logo、水印、乱码、额外肢体或服装穿模。'
].join(' ');

await mkdir(execRoot, { recursive: true });
await mkdir(hlsRoot, { recursive: true });

const result = await generateVideo({
  model: 'hailuo-h3-cankaosheng',
  prompt,
  refImageUrls: [sourceUrl],
  duration: 5,
  aspectRatio: '9:16'
});

const videoUrl = result.videoUrls?.[0];
if (!videoUrl) throw new Error('视频模型没有返回可下载地址');
const { buffer } = await fetchBuffer(videoUrl, { timeoutMs: 300000, maxBytes: 200 * 1024 * 1024 });
await writeFile(mp4Path, buffer);

await execFileAsync(process.env.FFMPEG_PATH || 'ffmpeg', [
  '-hide_banner', '-loglevel', 'error', '-y', '-i', mp4Path,
  '-frames:v', '1', '-q:v', '2', posterPath
]);

const hls = await packageVideoToHls(buffer);
if (!hls) throw new Error('HLS 未启用，无法为模板生成流媒体资源');
await writeFile(path.join(hlsRoot, 'index.m3u8'), hls.playlist);
await Promise.all(hls.segments.map(({ name, buffer: segment }) => writeFile(path.join(hlsRoot, name), segment)));

console.log(JSON.stringify({
  slug,
  model: result.providerJobId ? 'hailuo-h3-cankaosheng' : 'hailuo-h3-cankaosheng',
  requestedDuration: result.requestedDuration,
  effectiveDuration: result.effectiveDuration,
  videoBytes: buffer.byteLength,
  poster: posterPath,
  hlsSegments: hls.segments.map(({ name }) => name),
  source: sourceUrl
}, null, 2));
