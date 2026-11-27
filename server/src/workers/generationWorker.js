import crypto from 'node:crypto';
import os from 'node:os';
import { config } from '../config.js';
import { pool, query, withTransaction } from '../db/pool.js';
import { buildPrompt, getProvider, generatedText } from '../services/ai/index.js';
import { buildObjectKey, putObject, signGetUrl, extFromMime, deleteObject } from '../services/storage/index.js';
import { refundQuota } from '../services/quota.js';
import { fetchBuffer } from '../lib/http.js';
import { processSticker } from '../services/sticker/index.js';
import { checkImageSec } from '../services/wechat.js';
import { generateSpecial } from '../services/ai/special.js';
import { detectMediaType } from '../services/media-format.js';
import { packageVideoToHls } from '../services/video-hls.js';

const WORKER_ID = `${os.hostname()}-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;

let running = true;
let activeCount = 0;

function log(...args) {
  console.log(`[worker ${WORKER_ID}]`, ...args);
}

/**
 * 认领任务。SKIP LOCKED 让多个 worker 并发时不会抢到同一条，
 * 也不需要引入 Redis，2C2G 上省下 100MB+ 内存。
 */
async function claimJob() {
  const result = await query(
    `with candidate as (
       select id from generation_job
       where status = 'queued' and scheduled_at <= now() and attempt < max_attempts
       order by scheduled_at
       for update skip locked
       limit 1
     )
     update generation_job j
     set status = 'running',
         locked_at = now(),
         locked_by = $1,
         started_at = coalesce(j.started_at, now()),
         attempt = j.attempt + 1
     from candidate
     where j.id = candidate.id
     returning j.*`,
    [WORKER_ID]
  );
  return result.rows[0] || null;
}

/** worker 崩溃后留下的 running 任务要回收，否则永远卡住 */
async function releaseStaleJobs() {
  const unpaid=await query("select j.id,j.user_id,j.credits_cost from generation_job j where j.status in ('failed','canceled','expired') and j.credits_cost>0 and not exists(select 1 from credit_ledger l where l.ref_id=j.id and l.reason='generation_refund') limit 100");
  for(const j of unpaid.rows)await refundQuota(j.user_id,j.credits_cost,j.id);
  const result = await query(
    `update generation_job
     set status = case when attempt < max_attempts then 'queued' else 'failed' end,
         locked_at = null,
         locked_by = null,
         error_code = case when attempt >= max_attempts then 'WORKER_LOST' else error_code end,
         error_message = case when attempt >= max_attempts then '任务执行超时' else error_message end,
         finished_at = case when attempt >= max_attempts then now() else finished_at end
     where status = 'running'
       and locked_at < now() - ($1::int * interval '1 millisecond')
     returning id, user_id, credits_cost, status`,
    [config.worker.lockTimeoutMs]
  );
  for (const row of result.rows) {
    log(`回收僵尸任务 ${row.id} → ${row.status}`);
    if (row.status === 'failed') {
      await refundQuota(row.user_id, row.credits_cost || 1, row.id);
    }
  }
}

async function loadJobContext(job) {
  const template = await query(
    'select * from generation_template where key = $1',
    [job.template_key]
  );
  if (!template.rows.length) throw Object.assign(new Error('模板不存在'), { code: 'TEMPLATE_MISSING' });

  const cats = job.cat_ids?.length
    ? await query('select * from cat where id = any($1::uuid[]) order by created_at', [job.cat_ids])
    : { rows: [] };
  if (!cats.rows.length && !['ai-image', 'special-gif', 'special-emoji', 'special-video'].includes(job.template_key)) throw Object.assign(new Error('猫咪档案不存在'), { code: 'CAT_MISSING' });

  const personas = job.cat_ids?.length
    ? await query('select * from cat_persona where cat_id = any($1::uuid[])', [job.cat_ids])
    : { rows: [] };

  const assets = job.input_asset_ids?.length
    ? await query('select * from asset where id = any($1::uuid[])', [job.input_asset_ids])
    : { rows: [] };

  return { template: template.rows[0], cats: cats.rows, personas: personas.rows, assets: assets.rows };
}

async function processJob(job) {
  const { template, cats, personas, assets } = await loadJobContext(job);
  const refImageUrls = await Promise.all(assets.map(asset => signGetUrl(asset.object_key,3600)));
  if (!refImageUrls.length && job.template_key === 'pet-sticker') throw Object.assign(new Error('缺少输入照片'),{code:'INPUT_MISSING'});
  const heartbeat=setInterval(()=>query("update generation_job set locked_at=now() where id=$1 and locked_by=$2 and status='running'", [job.id,WORKER_ID]).catch(()=>{}),Math.max(15000,config.worker.lockTimeoutMs/3));
  let progressTicker = null;
  try {
    await query('update generation_job set progress=20 where id=$1 and locked_by=$2',[job.id,WORKER_ID]);
    // 上游模型通常不会持续返回百分比，不能让客户端长时间停在 20%。
    // 这里展示 20→78 的“创作中”阶段进度；真正完成后仍由 85/100 覆盖，避免伪造完成状态。
    let estimatedProgress = 20;
    progressTicker = setInterval(() => {
      if (estimatedProgress >= 78) return;
      estimatedProgress = Math.min(78, estimatedProgress + 2);
      query('update generation_job set progress=$2 where id=$1 and locked_by=$3 and status=\'running\'', [job.id, estimatedProgress, WORKER_ID]).catch(() => {});
    }, 1800);
    let buffer, contentType, generation, providerName;
    if (job.template_key==='pet-sticker') {
      const input=await fetchBuffer(refImageUrls[0],{timeoutMs:30000,maxBytes:10*1024*1024});
      buffer=await processSticker(input.buffer);contentType='image/png';generation={};providerName='local-rembg';
    } else {
      const prompt=buildPrompt({template,cats,personas,options:job.params||{}});
      if (job.template_key === 'special-gif' || job.template_key === 'special-emoji') {
        generation=await generateSpecial({
          type: job.template_key === 'special-gif' ? 'gif' : 'emoji',
          ...prompt,
          refImageUrls,
          skillPrompt: job.params?.skillPrompt,
          text: job.params?.text,
          mediaMode: job.params?.mediaMode
        });
        providerName = job.template_key === 'special-gif' ? 'media' : config.ai.provider;
      } else if (job.template_key === 'special-video') {
        const provider = getProvider();
        providerName = provider.name;
        generation = await provider.generateVideo({
          ...prompt,
          refImageUrls,
          model: job.params?.model || config.ai.video.defaultModel,
          duration: job.params?.duration || 3,
          aspectRatio: job.params?.aspectRatio || '9:16'
        });
      } else {
        const provider=getProvider();providerName=provider.name;
        generation=await provider.generateImage({...prompt,refImageUrls,seed:job.params?.seed,model:job.params?.model});
      }
      if (generation.imageBase64) {
        buffer = Buffer.from(generation.imageBase64, 'base64');
        contentType = generation.contentType || 'image/png';
      } else {
        const outputUrl = generation.videoUrls?.[0] || generation.imageUrls?.[0];
        if (!outputUrl) throw Object.assign(new Error('模型已完成，但暂时拿不到生成文件'), { code: 'OUTPUT_MISSING' });
        ({buffer,contentType}=await fetchBuffer(outputUrl,{timeoutMs:job.template_key === 'special-video' ? config.ai.video.timeoutMs : config.ai.timeoutMs}));
      }
    }
    clearInterval(progressTicker);
    progressTicker = null;
    await query('update generation_job set progress=85 where id=$1 and locked_by=$2',[job.id,WORKER_ID]);
    const mime = detectMediaType({
      buffer,
      contentType,
      url: generation?.videoUrls?.[0] || generation?.imageUrls?.[0],
      requestedType: job.template_key === 'special-video'
        ? 'video/mp4'
        : (job.template_key === 'special-gif' || (job.template_key === 'special-emoji' && job.params?.mediaMode === 'animated'))
        ? 'image/gif'
        : 'image/png'
    });
    if (config.moderation.enabled && mime.startsWith('image/')) {
      const check=await checkImageSec(buffer,mime);
      if (!check.pass) throw Object.assign(new Error('生成内容未通过安全审核'),{code:'CONTENT_BLOCKED'});
    }
    const objectKey=buildObjectKey({userId:job.user_id,purpose:'output',ext:extFromMime(mime)});
    await putObject({objectKey,buffer,contentType:mime});
    let hlsVariant = null;
    const uploadedHlsKeys = [];
    if (job.template_key === 'special-video' && mime === 'video/mp4') {
      try {
        const packaged = await packageVideoToHls(buffer);
        if (packaged) {
          const manifestObjectKey = buildObjectKey({ userId: job.user_id, purpose: 'output', ext: 'm3u8' });
          await putObject({ objectKey: manifestObjectKey, buffer: Buffer.from(packaged.playlist), contentType: 'application/vnd.apple.mpegurl' });
          uploadedHlsKeys.push(manifestObjectKey);
          const segmentObjectKeys = [];
          for (const segment of packaged.segments) {
            const segmentObjectKey = buildObjectKey({ userId: job.user_id, purpose: 'output', ext: 'ts' });
            await putObject({ objectKey: segmentObjectKey, buffer: segment.buffer, contentType: 'video/mp2t' });
            uploadedHlsKeys.push(segmentObjectKey);
            segmentObjectKeys.push(segmentObjectKey);
          }
          hlsVariant = { manifestObjectKey, segmentObjectKeys, playlist: packaged.playlist };
        }
      } catch (error) {
        await Promise.all(uploadedHlsKeys.map((key) => deleteObject(key).catch(() => {})));
        uploadedHlsKeys.length = 0;
        log(`任务 ${job.id} HLS 切片失败，保留 MP4 回退：${error.message}`);
      }
    }
    const body=job.template_key==='pet-sticker'?`${cats[0].name}的专属贴纸，今天也要可可爱爱。`:job.params?.text || (job.template_key === 'special-video' ? `${job.params?.skillId || '猫咪短视频'} · ${job.params?.duration || 3} 秒` : generatedText(job.template_key,cats[0]));
    try {
      await withTransaction(async client=>{
        const owned=await client.query("select id from generation_job where id=$1 and locked_by=$2 and status='running' for update",[job.id,WORKER_ID]);
        if (!owned.rows.length) return;
        const visibility = job.template_key === 'special-video' ? 'private' : 'public';
        const asset=await client.query("insert into asset(owner_user_id,object_key,mime,byte_size,purpose,visibility,status) values($1,$2,$3,$4,'output',$5,'ready') returning id",[job.user_id,objectKey,mime,buffer.length,visibility]);
        if (hlsVariant) {
          await client.query(
            `insert into video_variant(asset_id,format,manifest_object_key,segment_object_keys,playlist,status)
             values($1,'hls',$2,$3::jsonb,$4,'ready')`,
            [asset.rows[0].id, hlsVariant.manifestObjectKey, JSON.stringify(hlsVariant.segmentObjectKeys), hlsVariant.playlist]
          );
        }
        const work=await client.query("insert into work(user_id,job_id,cat_ids,template_key,title,body,cover_asset_id,visibility) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",[job.user_id,job.id,job.cat_ids,job.template_key,template.name,body,asset.rows[0].id,visibility]);
        const resultPayload = {
          workId: work.rows[0].id,
          title: template.name,
          text: body,
          mime,
          width: 1024,
          height: 1024,
          ...(job.template_key === 'special-video'
            ? { mediaAssetId: asset.rows[0].id, requestedDuration: generation.requestedDuration || job.params?.duration || 3, effectiveDuration: generation.effectiveDuration || job.params?.duration || 3, hlsAvailable: Boolean(hlsVariant) }
            : { imageAssetId: asset.rows[0].id })
        };
        await client.query("update generation_job set status='succeeded',progress=100,provider=$2,provider_job_id=$3,result=$4::jsonb,locked_at=null,locked_by=null,finished_at=now() where id=$1",[job.id,providerName,generation.providerJobId||null,JSON.stringify(resultPayload)]);
      });
    } catch (error) {
      await Promise.all([objectKey, ...uploadedHlsKeys].map((key) => deleteObject(key).catch(() => {})));
      throw error;
    }
    log(`任务 ${job.id} 完成`);
  } finally {
    if (progressTicker) clearInterval(progressTicker);
    clearInterval(heartbeat);
  }
}

async function handleFailure(job, error) {
  const ownership=await query("select id from generation_job where id=$1 and locked_by=$2 and status='running'",[job.id,WORKER_ID]);
  if(!ownership.rows.length)return;
  const code = error.code || 'GENERATION_FAILED';
  const message = error.message || '生成失败';
  const canRetry = job.attempt < job.max_attempts && !['CONTENT_BLOCKED', 'INPUT_MISSING', 'TEMPLATE_MISSING','STICKER_UNAVAILABLE','INVALID_IMAGE','NO_SUBJECT'].includes(code);

  if (canRetry) {
    const backoffSeconds = Math.min(30, 3 ** job.attempt);
    await query(
      `update generation_job
       set status = 'queued', locked_at = null, locked_by = null,
           scheduled_at = now() + ($2::int * interval '1 second'),
           error_code = $3, error_message = $4
       where id = $1`,
      [job.id, backoffSeconds, code, message]
    );
    log(`任务 ${job.id} 失败，${backoffSeconds}s 后重试（第 ${job.attempt} 次）：${message}`);
    return;
  }

  await query(
    `update generation_job
     set status = 'failed', locked_at = null, locked_by = null,
         error_code = $2, error_message = $3, finished_at = now()
     where id = $1`,
    [job.id, code, message]
  );

  // 生成失败必须退还额度，符合「不能假设无限免费生成」的成本原则
  if (job.credits_cost > 0) {
    await refundQuota(job.user_id, job.credits_cost, job.id);
  }
  log(`任务 ${job.id} 最终失败：${code} ${message}`);
}

async function loop() {
  let lastSweep = 0;

  while (running) {
    try {
      if (Date.now() - lastSweep > 60000) {
        await releaseStaleJobs();
        lastSweep = Date.now();
      }

      if (activeCount >= config.worker.concurrency) {
        await sleep(config.worker.pollMs);
        continue;
      }

      const job = await claimJob();
      if (!job) {
        await sleep(config.worker.pollMs);
        continue;
      }

      activeCount += 1;
      // 不 await，让并发度真正生效
      processJob(job)
        .catch((error) => handleFailure(job, error))
        .catch((error) => log('失败处理本身出错', error))
        .finally(() => {
          activeCount -= 1;
        });
    } catch (error) {
      log('主循环异常', error);
      await sleep(3000);
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function shutdown(signal) {
  log(`收到 ${signal}，等待进行中的任务结束…`);
  running = false;
  const deadline = Date.now() + 30000;
  while (activeCount > 0 && Date.now() < deadline) {
    await sleep(500);
  }
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log(`启动，并发 ${config.worker.concurrency}，AI 供应商 ${config.ai.provider}`);
loop();
