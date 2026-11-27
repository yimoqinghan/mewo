import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../miniprogram/utils/media-source.js', import.meta.url), 'utf8');
const { isPublicStaticPath, shouldDownloadSource } = await import(new URL('../../miniprogram/utils/media-source.js', import.meta.url));

assert.equal(
  isPublicStaticPath('https://api.missmeow.net/assets/design-webp/cat-home.webp', 'https://api.missmeow.net'),
  true,
  '言喵公开静态素材应允许服务端导入'
);
assert.equal(
  isPublicStaticPath('https://static.missmeow.net/static/design-webp/cat-home.webp', 'https://api.missmeow.net'),
  true,
  '静态 CDN 素材应允许服务端导入'
);
assert.equal(
  isPublicStaticPath('https://static.missmeow.net/u/user-photo.webp', 'https://api.missmeow.net'),
  false,
  '用户媒体不能走公开静态素材导入接口'
);
assert.equal(
  shouldDownloadSource('wxfile://tmp/yanmiao-photo.jpg', 'https://api.missmeow.net'),
  false,
  '微信本地临时文件不能交给 downloadFile'
);
assert.equal(
  shouldDownloadSource('/var/mobile/Containers/Data/photo.jpg', 'https://api.missmeow.net'),
  false,
  '本地绝对路径不能交给 downloadFile'
);
assert.equal(
  shouldDownloadSource('https://example.com/photo.jpg', 'https://api.missmeow.net'),
  true,
  '普通远程图片仍应先下载到本地再上传'
);
assert.match(source, /isPublicStaticPath/);
assert.match(source, /shouldDownloadSource/);
console.log('special create resource regression: passed');
