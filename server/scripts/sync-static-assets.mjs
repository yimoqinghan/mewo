import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import COS from 'cos-nodejs-sdk-v5';

const root = path.resolve(fileURLToPath(new URL('../public/assets/', import.meta.url)));
const bucket = process.env.COS_BUCKET || '';
const region = process.env.COS_REGION || 'ap-shanghai';
const secretId = process.env.COS_SECRET_ID || '';
const secretKey = process.env.COS_SECRET_KEY || '';
const prefix = (process.env.STATIC_ASSETS_PREFIX || 'static').replace(/^\/+|\/+$/g, '') || 'static';
// 品牌静态素材需要 CDN 匿名回源拉取，因此对象 ACL 必须显式设为 public-read。
// 注意：存储桶本身仍是私有读写，用户照片与生成作品在 u/ 前缀下保持私有。
const acl = process.env.STATIC_ASSETS_ACL || 'public-read';
const mimeByExt = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t',
  '.glb': 'model/gltf-binary', '.mp4': 'video/mp4'
};

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('._') || entry.name === '.DS_Store') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function putObject(client, objectKey, body, contentType) {
  return new Promise((resolve, reject) => {
    client.putObject({
      Bucket: bucket,
      Region: region,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ACL: acl,
      CacheControl: 'public, max-age=31536000, immutable'
    }, (error, data) => (error ? reject(error) : resolve(data)));
  });
}

if (!bucket || !secretId || !secretKey) {
  console.error('[static-assets] 缺少 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET，未同步静态资源');
  process.exitCode = 1;
} else {
  const files = await listFiles(root);
  const client = new COS({ SecretId: secretId, SecretKey: secretKey });
  let bytes = 0;
  for (const filePath of files) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    const objectKey = `${prefix}/${relative}`;
    const body = await readFile(filePath);
    const contentType = mimeByExt[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    await putObject(client, objectKey, body, contentType);
    bytes += body.byteLength;
    console.log(`[static-assets] synced ${objectKey}`);
  }
  console.log(`[static-assets] complete files=${files.length} bytes=${bytes} bucket=${bucket} prefix=${prefix}`);
}
