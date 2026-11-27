import 'dotenv/config';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GIF_SKILLS, EMOJI_SKILLS } from '../../miniprogram/services/special-creations.js';
import { generateSpecial } from '../src/services/ai/special.js';
import { fetchBuffer } from '../src/lib/http.js';
import { putObject } from '../src/services/cos.js';

const root = path.resolve(fileURLToPath(new URL('../public/assets/special-examples/', import.meta.url)));
const sourceUrl = process.env.SPECIAL_EXAMPLE_SOURCE_URL
  || 'https://static.missmeow.net/static/design-webp/cat-menu-perched.webp';
const type = process.argv.includes('--emoji') ? 'emoji' : 'gif';
const skills = type === 'emoji' ? EMOJI_SKILLS : GIF_SKILLS;
const outputExt = type === 'emoji' ? 'png' : 'gif';
const outputMime = type === 'emoji' ? 'image/png' : 'image/gif';
const assetVersion = process.env.SPECIAL_EXAMPLE_ASSET_VERSION || 'v2';

function selectedSkills() {
  const ids = process.argv.filter((arg) => arg.startsWith('--id=')).map((arg) => arg.slice(5));
  if (!ids.length) return skills;
  return skills.filter((skill) => ids.includes(skill.id));
}

function bufferFromResult(result) {
  if (result.imageBase64) return Buffer.from(result.imageBase64, 'base64');
  if (result.imageUrls?.[0]) return fetchBuffer(result.imageUrls[0], { timeoutMs: 120000, maxBytes: 30 * 1024 * 1024 }).then((item) => item.buffer);
  throw new Error('模型没有返回可下载的示例文件');
}

function assertFormat(buffer) {
  if (type === 'gif') {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header !== 'GIF89a' && header !== 'GIF87a') throw new Error(`模型返回的不是 GIF 文件：${header || 'empty'}`);
  } else if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('模型返回的不是 PNG 文件');
  }
}

await mkdir(root, { recursive: true });
for (const skill of selectedSkills()) {
  try {
    const prompt = type === 'emoji'
      ? `制作一张高分辨率聊天表情示例：${skill.prompt}`
      : `制作一张高分辨率、真实可播放的 2 秒循环 GIF 示例：${skill.prompt}`;
    const result = await generateSpecial({
      type,
      prompt,
      refImageUrls: [sourceUrl],
      skillPrompt: skill.prompt,
      text: type === 'emoji' ? skill.overlay : '',
      mediaMode: type === 'emoji' ? 'static' : 'animated'
    });
    const buffer = await bufferFromResult(result);
    assertFormat(buffer);
    const filename = `${type}-${skill.id}-${assetVersion}.${outputExt}`;
    const objectKey = `static/special-examples/${filename}`;
    await writeFile(path.join(root, filename), buffer);
    await putObject({ objectKey, buffer, contentType: outputMime });
    console.log(`[special-examples] generated ${filename} bytes=${buffer.length}`);
  } catch (error) {
    console.error(`[special-examples] failed ${type}-${skill.id}: ${error.message}`);
  }
}
