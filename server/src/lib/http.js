import { errors } from './errors.js';

/**
 * 带超时的 fetch。所有外呼（微信、抖音、火山方舟、COS 下载）都必须走这里，
 * 避免上游卡住把 Node 进程的连接和内存耗尽。
 */
export async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = 15000, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw errors.upstream(`上游请求超时：${new URL(url).host}`);
    }
    throw errors.upstream(`上游请求失败：${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, options = {}) {
  const response = await fetchWithTimeout(url, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw errors.upstream(`上游返回非 JSON：${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw errors.upstream(`上游返回 ${response.status}`, json);
  }
  return json;
}

export async function fetchBuffer(url, options = {}) {
  const {maxBytes = 20*1024*1024, timeoutMs = 30000, ...rest}=options;
  const response=await fetchWithTimeout(url,{...rest,timeoutMs});
  if(!response.ok)throw errors.upstream(`下载失败 ${response.status}`);
  const reader=response.body.getReader();let bytes=0,parts=[];
  let timer;
  try {
    const data=await Promise.race([
      (async()=>{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>maxBytes)throw errors.badRequest('文件超过允许大小');parts.push(Buffer.from(value));}return Buffer.concat(parts);})(),
      new Promise((_,reject)=>{timer=setTimeout(()=>{reader.cancel().catch(()=>{});reject(errors.upstream('下载图片超时'));},timeoutMs);})
    ]);
    return {buffer:data,contentType:(response.headers.get('content-type')||'application/octet-stream').split(';')[0]};
  } finally {clearTimeout(timer);reader.cancel().catch(()=>{});}
}
