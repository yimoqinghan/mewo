import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const miniprogramRoot = path.join(projectRoot, 'miniprogram');
const assetRoot = path.join(projectRoot, 'server/public/assets');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else if (/\.(?:js|json|wxml|wxss)$/.test(entry.name)) files.push(target);
  }
  return files;
}

async function walkAll(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkAll(target));
    else files.push(target);
  }
  return files;
}

const references = new Set();
for (const filePath of await walk(miniprogramRoot)) {
  const source = await readFile(filePath, 'utf8');
  for (const match of source.matchAll(/asset\(\s*['"]([^'"]+)['"]\s*\)/g)) references.add(match[1]);
  for (const match of source.matchAll(/\/assets\/([A-Za-z0-9_./-]+)/g)) references.add(match[1]);
}

// 动态模型路径（例如 models/${variant}.glb）无法从 asset() 正则中还原，
// 同时把公开资产目录中的每个文件纳入 HTTP 路由检查。
for (const filePath of await walkAll(assetRoot)) {
  references.add(path.relative(assetRoot, filePath).split(path.sep).join('/'));
}

const missing = [];
for (const relative of [...references].sort()) {
  if (relative.endsWith('/')) continue;
  const target = path.resolve(assetRoot, relative);
  if (!target.startsWith(`${assetRoot}${path.sep}`)) {
    missing.push(`${relative} (非法路径)`);
    continue;
  }
  try {
    await access(target);
  } catch {
    missing.push(relative);
  }
}

assert.deepEqual(missing, [], `发现无法解析的运行时资源：\n${missing.join('\n')}`);

// 用开发态静态路由逐个请求，避免只验证磁盘存在而漏掉路由/响应问题。
process.env.NODE_ENV = 'development';
process.env.COS_SECRET_ID = '';
process.env.COS_SECRET_KEY = '';
process.env.COS_BUCKET = '';
const { default: Fastify } = await import('fastify');
const { default: assetRoutes } = await import('../src/modules/assets/routes.js');
const app = Fastify();
await app.register(assetRoutes);
await app.ready();
try {
  for (const relative of [...references].sort()) {
    if (relative.endsWith('/')) continue;
    const response = await app.inject({ method: 'GET', url: `/assets/${relative}` });
    assert.equal(response.statusCode, 200, `${relative} 返回 HTTP ${response.statusCode}`);
    assert.match(response.headers['content-type'] || '', /\//, `${relative} 缺少有效 Content-Type`);
  }
} finally {
  await app.close();
}

const remoteBaseUrl = String(process.env.RESOURCE_AUDIT_BASE_URL || '').replace(/\/$/, '');
if (remoteBaseUrl) {
  for (const relative of [...references].sort()) {
    if (relative.endsWith('/')) continue;
    const response = await fetch(`${remoteBaseUrl}/assets/${relative}`, { redirect: 'follow' });
    assert.equal(response.status, 200, `生产资源 ${relative} 返回 HTTP ${response.status}`);
    assert.match(response.headers.get('content-type') || '', /\//, `生产资源 ${relative} 缺少有效 Content-Type`);
    await response.arrayBuffer();
  }
  console.log(`production resource audit: passed (${references.size} resources)`);
}

console.log(`resource audit: passed (${references.size} references)`);
