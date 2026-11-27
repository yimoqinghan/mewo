const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

function wrap(value) {
  return value && value.ok === false ? value : ok(value);
}

function now() {
  return Date.now();
}

function getContext() {
  const context = cloud.getWXContext();
  if (!context.OPENID) {
    const error = new Error('无法确认微信用户身份');
    error.code = 'IDENTITY_REQUIRED';
    throw error;
  }
  return context;
}

function mapCat(row) {
  return {
    id: row.clientId || row._id,
    name: row.name,
    age: row.age || '',
    traits: row.traits || '',
    personality: row.personality || '',
    avatar: row.avatar || '/assets/brand-cat.png',
    avatarFileId: row.avatarFileId || '',
    isDefault: Boolean(row.isDefault),
    archived: Boolean(row.archived),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function mapWork(row) {
  return {
    id: row._id,
    workId: row._id,
    catId: row.catId,
    catName: row.catName,
    templateKey: row.templateKey,
    templateName: row.templateName,
    title: row.title,
    text: row.text,
    imageFileId: row.imageFileId || '',
    status: row.status,
    isPlaceholder: Boolean(row.isPlaceholder),
    saved: Boolean(row.saved),
    createdAt: row.createdAt
  };
}

async function listCats(openid, includeArchived = false) {
  const where = includeArchived ? { ownerOpenId: openid } : { ownerOpenId: openid, archived: false };
  const result = await db.collection('cats')
    .where(where)
    .orderBy('updatedAt', 'desc')
    .get();
  return { items: result.data.map(mapCat) };
}

async function getCat(openid, catId) {
  const result = await db.collection('cats')
    .where({ ownerOpenId: openid, clientId: catId })
    .limit(1)
    .get();
  if (!result.data.length) return fail('CAT_NOT_FOUND', '猫咪档案不存在或无权访问');
  return { cat: mapCat(result.data[0]), persona: null };
}

async function saveCat(openid, cat = {}) {
  const name = String(cat.name || '').trim();
  if (!name) return fail('CAT_NAME_REQUIRED', '请先填写猫咪名字');

  const clientId = String(cat.id || `cat-${now()}-${Math.random().toString(36).slice(2, 7)}`);
  const existing = await db.collection('cats')
    .where({ ownerOpenId: openid, clientId })
    .limit(1)
    .get();
  const timestamp = now();
  const data = {
    ownerOpenId: openid,
    clientId,
    name,
    age: String(cat.age || ''),
    traits: Array.isArray(cat.traits) ? cat.traits : String(cat.traits || ''),
    personality: String(cat.personality || ''),
    avatar: cat.avatar || '/assets/brand-cat.png',
    avatarFileId: cat.avatarFileId || '',
    archived: false,
    updatedAt: timestamp
  };
  if (cat.isDefault !== undefined) data.isDefault = Boolean(cat.isDefault);

  let documentId;
  if (existing.data.length) {
    documentId = existing.data[0]._id;
    if (data.isDefault) {
      await db.collection('cats').where({ ownerOpenId: openid, archived: false }).update({ data: { isDefault: false } });
    }
    await db.collection('cats').doc(documentId).update({ data });
  } else {
    if (data.isDefault) {
      await db.collection('cats').where({ ownerOpenId: openid, archived: false }).update({ data: { isDefault: false } });
    }
    if (!(await db.collection('cats').where({ ownerOpenId: openid, archived: false }).count()).total) data.isDefault = true;
    data.createdAt = timestamp;
    const inserted = await db.collection('cats').add({ data });
    documentId = inserted._id;
  }

  return mapCat({ ...data, _id: documentId });
}

async function setCatState(openid, catId, patch) {
  const result = await db.collection('cats').where({ ownerOpenId: openid, clientId: catId }).limit(1).get();
  if (!result.data.length) return fail('CAT_NOT_FOUND', '猫咪档案不存在或无权访问');
  await db.collection('cats').doc(result.data[0]._id).update({ data: { ...patch, updatedAt: now() } });
  return { cat: mapCat({ ...result.data[0], ...patch, updatedAt: now() }) };
}

async function setDefaultCat(openid, catId) {
  const target = await db.collection('cats').where({ ownerOpenId: openid, clientId: catId, archived: false }).limit(1).get();
  if (!target.data.length) return fail('CAT_NOT_FOUND', '猫咪档案不存在或已归档');
  await db.collection('cats').where({ ownerOpenId: openid, archived: false }).update({ data: { isDefault: false } });
  await db.collection('cats').doc(target.data[0]._id).update({ data: { isDefault: true, updatedAt: now() } });
  return { catId };
}

async function registerAsset(openid, fileId, purpose) {
  if (!fileId) return fail('FILE_ID_REQUIRED', '上传文件标识缺失');
  const inserted = await db.collection('assets').add({
    data: {
      ownerOpenId: openid,
      fileId,
      purpose: purpose === 'avatar' ? 'avatar' : 'input',
      status: 'ready',
      createdAt: now()
    }
  });
  return { assetId: inserted._id, fileId };
}

async function findOwnedAsset(openid, assetId) {
  if (!assetId) return null;
  const result = await db.collection('assets')
    .where({ _id: assetId, ownerOpenId: openid, status: 'ready' })
    .limit(1)
    .get();
  return result.data[0] || null;
}

async function createGeneration(openid, payload = {}) {
  const catId = String(payload.catId || '');
  const templateKey = String(payload.templateKey || 'today');
  if (!catId) return fail('CAT_REQUIRED', '请先选择猫咪');

  const catResult = await db.collection('cats')
    .where({ ownerOpenId: openid, clientId: catId, archived: false })
    .limit(1)
    .get();
  const cat = catResult.data[0];
  if (!cat) return fail('CAT_NOT_FOUND', '猫咪档案不存在或无权使用');

  const asset = await findOwnedAsset(openid, payload.assetId);
  if (!asset) return fail('INPUT_MISSING', '请选择一张宠物照片');
  if (payload.requestKey) {
    const previous = await db.collection('generation_tasks').where({ ownerOpenId: openid, requestKey: payload.requestKey }).limit(1).get();
    if (previous.data.length) {
      const old = previous.data[0];
      return { taskId: old._id, status: old.status, progress: old.progress || 0, workId: old.workId || '', reused: true };
    }
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const used = await db.collection('generation_tasks').where({ ownerOpenId: openid, status: 'succeeded', createdAt: db.command.gte(start.getTime()) }).count();
  if (used.total >= 3) return fail('QUOTA_EXCEEDED', '今日免费生成次数已用完');
  const imageFileId = asset ? asset.fileId : cat.avatarFileId || '';
  const taskData = {
    ownerOpenId: openid,
    catId,
    catName: cat.name,
    templateKey,
    inputAssetId: asset ? asset._id : '',
    requestKey: payload.requestKey || '',
    status: 'succeeded',
    progress: 100,
    isPlaceholder: true,
    createdAt: now(),
    finishedAt: now()
  };
  const task = await db.collection('generation_tasks').add({ data: taskData });
  const work = await db.collection('works').add({
    data: {
      ownerOpenId: openid,
      taskId: task._id,
      catId,
      catName: cat.name,
      templateKey,
      templateName: templateKey,
      title: '言喵创作预览',
      text: `${cat.name} 的专属作品已经生成。真实 AI 生图接入后，这里会替换为最终作品。`,
      imageFileId,
      status: 'succeeded',
      isPlaceholder: true,
      saved: false,
      createdAt: now()
    }
  });

  await db.collection('generation_tasks').doc(task._id).update({
    data: { workId: work._id }
  });

  return {
    taskId: task._id,
    status: 'succeeded',
    progress: 100,
    workId: work._id,
    result: {
      workId: work._id,
      imageFileId,
      title: '言喵创作预览',
      text: `${cat.name} 的专属作品已经生成。真实 AI 生图接入后，这里会替换为最终作品。`,
      isPlaceholder: true
    }
  };
}

async function getGeneration(openid, taskId) {
  const result = await db.collection('generation_tasks')
    .where({ _id: taskId, ownerOpenId: openid })
    .limit(1)
    .get();
  const task = result.data[0];
  if (!task) return fail('TASK_NOT_FOUND', '生成任务不存在');
  return {
    taskId: task._id,
    status: task.status,
    progress: task.progress || 0,
    workId: task.workId || '',
    error: task.error || null,
    result: task.workId ? { workId: task.workId, imageFileId: task.imageFileId || '', isPlaceholder: Boolean(task.isPlaceholder) } : null
  };
}

async function listWorks(openid, params = {}) {
  const where = { ownerOpenId: openid };
  if (params.saved === true) where.saved = true;
  const result = await db.collection('works')
    .where(where)
    .orderBy('createdAt', 'desc')
    .limit(50)
    .get();
  return result.data.map(mapWork);
}

async function getWork(openid, workId) {
  const result = await db.collection('works').where({ _id: workId, ownerOpenId: openid }).limit(1).get();
  if (!result.data.length) return fail('WORK_NOT_FOUND', '作品不存在或无权操作');
  return { work: mapWork(result.data[0]) };
}

async function cancelGeneration(openid, taskId) {
  const result = await db.collection('generation_tasks').where({ _id: taskId, ownerOpenId: openid, status: 'queued' }).limit(1).get();
  if (!result.data.length) return fail('TASK_NOT_CANCELABLE', '任务已开始执行，无法取消');
  await db.collection('generation_tasks').doc(taskId).update({ data: { status: 'canceled', error: { code: 'CANCELED', message: '已取消' }, updatedAt: now() } });
  return { canceled: true };
}

async function getMe(openid) {
  return { user: { id: openid, displayName: '微信用户', phoneBound: false, phoneMasked: null } };
}

async function getConfig() {
  return { brand: { name: '言喵', slogan: '和猫一起，把日子过得可爱一点。' }, features: { wechatLogin: true, cloudStorage: true, placeholderGeneration: true } };
}

async function getQuota(openid) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const result = await db.collection('generation_tasks').where({ ownerOpenId: openid, status: 'succeeded', createdAt: db.command.gte(start.getTime()) }).count();
  return { quota: { dailyLimit: 3, usedToday: result.total, remaining: Math.max(3 - result.total, 0), paidCredits: 0 } };
}

async function saveWork(openid, workId) {
  const result = await db.collection('works')
    .where({ _id: workId, ownerOpenId: openid })
    .limit(1)
    .get();
  if (!result.data.length) return fail('WORK_NOT_FOUND', '作品不存在或无权操作');
  await db.collection('works').doc(workId).update({ data: { saved: true, updatedAt: now() } });
  return { workId, saved: true };
}

exports.main = async (event) => {
  try {
    const { OPENID } = getContext();
    const action = event.action;
    if (action === 'getMe') return wrap(await getMe(OPENID));
    if (action === 'getConfig') return wrap(await getConfig());
    if (action === 'getQuota') return wrap(await getQuota(OPENID));
    if (action === 'listCats') return wrap(await listCats(OPENID, event.includeArchived));
    if (action === 'getCat') return wrap(await getCat(OPENID, event.catId));
    if (action === 'saveCat') return wrap(await saveCat(OPENID, event.cat));
    if (action === 'archiveCat') return wrap(await setCatState(OPENID, event.catId, { archived: true, isDefault: false }));
    if (action === 'restoreCat') return wrap(await setCatState(OPENID, event.catId, { archived: false }));
    if (action === 'setDefaultCat') return wrap(await setDefaultCat(OPENID, event.catId));
    if (action === 'registerAsset') return wrap(await registerAsset(OPENID, event.fileId, event.purpose));
    if (action === 'createGeneration') return wrap(await createGeneration(OPENID, event));
    if (action === 'getGeneration') return wrap(await getGeneration(OPENID, event.taskId));
    if (action === 'listWorks') return wrap(await listWorks(OPENID, event));
    if (action === 'getWork') return wrap(await getWork(OPENID, event.workId));
    if (action === 'saveWork') return wrap(await saveWork(OPENID, event.workId));
    if (action === 'cancelGeneration') return wrap(await cancelGeneration(OPENID, event.taskId));
    return fail('ACTION_NOT_FOUND', '不支持的云端操作');
  } catch (error) {
    console.error('meow-api error', error);
    return fail(error.code || 'CLOUD_FUNCTION_ERROR', error.message || '云端服务异常');
  }
};
