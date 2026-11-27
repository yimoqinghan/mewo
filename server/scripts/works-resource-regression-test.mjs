import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const worksDir = path.join(projectRoot, 'miniprogram/subpackages/creation/works');
const wxml = await readFile(path.join(worksDir, 'works.wxml'), 'utf8');
const wxss = await readFile(path.join(worksDir, 'works.wxss'), 'utf8');

assert.match(wxml, /binderror="handleWorkImageError"/, '作品图片必须有加载失败处理');
assert.match(wxml, /work-card__placeholder/, '作品图片失败时必须渲染占位样式');
assert.match(wxml, /lazy-load="\{\{true\}\}"/, '作品列表必须启用图片懒加载');
assert.match(wxml, /bindtap="openWork"/, '点击作品必须进入作品详情页');
assert.match(await readFile(path.join(worksDir, 'works.js'), 'utf8'), /sticker-result\/sticker-result\?id=/, '作品详情必须使用独立页面加载原图');
assert.match(wxss, /\.work-card__media\s*\{[\s\S]*?height\s*:/, '作品图片容器必须有固定高度，避免图片失败后塌缩');

console.log('works resource regression: passed');
