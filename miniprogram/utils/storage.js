const adapter = require('./adapter');
let photoDraft = '';
const currentUser = () => adapter.storageGet('ym_user', null);
const key = (name) => `ym_${currentUser() ? currentUser().id : 'guest'}_${name}`;
const getDateKey = (date = new Date()) => {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const normalizeWelfareState = (value) => ({
  coins: Math.max(0, Number(value?.coins) || 0),
  totalEarned: Math.max(0, Number(value?.totalEarned) || 0),
  streak: Math.max(0, Number(value?.streak) || 0),
  lastCheckIn: value?.lastCheckIn || '',
  lastCheckInReward: Math.max(0, Number(value?.lastCheckInReward) || 0),
  claimedTasks: value?.claimedTasks && typeof value.claimedTasks === 'object' ? value.claimedTasks : {},
  claimedReferrals: Array.isArray(value?.claimedReferrals) ? value.claimedReferrals.filter(Boolean).slice(0, 50) : [],
  transactions: Array.isArray(value?.transactions) ? value.transactions.slice(0, 30) : []
});

const normalizeCyberBlessingState = (value) => ({
  date: value?.date || '',
  woodFishCount: Math.max(0, Number(value?.woodFishCount) || 0),
  lastKnockAt: Math.max(0, Number(value?.lastKnockAt) || 0),
  blessing: value?.blessing && typeof value.blessing === 'object' ? value.blessing : null,
  totalBlessings: Math.max(0, Number(value?.totalBlessings) || 0)
});

function addWelfareReward(state, amount, label, source) {
  const reward = Math.max(0, Number(amount) || 0);
  return {
    ...state,
    coins: state.coins + reward,
    totalEarned: state.totalEarned + reward,
    transactions: [{ id: `coin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label, source, amount: reward, createdAt: Date.now() }, ...state.transactions].slice(0, 30)
  };
}

function write(name, value) {
  if (!adapter.storageSet(key(name), value)) throw new Error('设备存储空间不足，请清理后重试');
}
module.exports = {
  getUser: currentUser,
  setUser(user) { if (!adapter.storageSet('ym_user', user)) throw new Error('登录信息保存失败'); },
  clearUser() { adapter.storageRemove('ym_user'); photoDraft = ''; },
  getCats: () => adapter.storageGet(key('cats'), []),
  saveCats: cats => write('cats', cats),
  mergeCatLocal(catId, patch) {
    const cats = module.exports.getCats();
    const index = cats.findIndex((cat) => cat.id === catId);
    if (index < 0) cats.push({ id: catId, ...patch });
    else cats[index] = { ...cats[index], ...patch };
    write('cats', cats);
    return cats;
  },
  getCurrentCatId: () => adapter.storageGet(key('current_cat'), ''),
  setCurrentCatId: id => write('current_cat', id),
  getWorks: () => adapter.storageGet(key('works'), []),
  saveWorks: works => write('works', works),
  getPendingGeneration: () => adapter.storageGet(key('pending_sticker'), null),
  setPendingGeneration: job => write('pending_sticker', job),
  clearPendingGeneration: () => adapter.storageRemove(key('pending_sticker')),
  getPendingSpecialTemplate: () => adapter.storageGet(key('pending_special_template'), null),
  setPendingSpecialTemplate: selection => write('pending_special_template', selection),
  clearPendingSpecialTemplate: () => adapter.storageRemove(key('pending_special_template')),
  getCreatorSkillIds: () => adapter.storageGet(key('creator_skill_ids'), []),
  saveCreatorSkillIds: ids => write('creator_skill_ids', ids),
  getCameraTemplates: () => adapter.storageGet(key('camera_templates'), {}),
  saveCameraTemplates: templates => write('camera_templates', templates),
  getFeedbackRecords: () => adapter.storageGet(key('feedback_records'), []),
  saveFeedbackRecords: records => write('feedback_records', records),
  getCalendarEvents: () => adapter.storageGet(key('calendar_events'), []),
  saveCalendarEvents: events => write('calendar_events', Array.isArray(events) ? events : []),
  getTraceRecords: () => adapter.storageGet(key('trace_records'), []),
  saveTraceRecords: records => write('trace_records', Array.isArray(records) ? records : []),
  getWelfareState: () => normalizeWelfareState(adapter.storageGet(key('welfare_state'), null)),
  saveWelfareState: state => write('welfare_state', normalizeWelfareState(state)),
  getCyberBlessingState: () => normalizeCyberBlessingState(adapter.storageGet(key('cyber_blessing_state'), null)),
  saveCyberBlessingState: state => write('cyber_blessing_state', normalizeCyberBlessingState(state)),
  claimCyberBlessingKnock(date, impactAt, interval = 1800) {
    const now = Number(impactAt) || Date.now();
    const current = module.exports.getCyberBlessingState();
    const lockKey = key('cyber_blessing_knock_lock');
    const lock = adapter.storageGet(lockKey, null);
    const lastAt = Math.max(Number(current.date === date ? current.lastKnockAt : 0) || 0, Number(lock?.date === date ? lock.at : 0) || 0);
    if (now - lastAt < Math.max(0, Number(interval) || 0)) return { claimed: false, state: current };
    const nextState = { ...current, date, woodFishCount: current.date === date ? current.woodFishCount + 1 : 1, lastKnockAt: now };
    if (!adapter.storageSet(lockKey, { date, at: now })) return { claimed: false, state: current };
    module.exports.saveCyberBlessingState(nextState);
    return { claimed: true, state: nextState };
  },
  getWelfareShareCode() {
    const storageKey = key('welfare_share_code');
    const existing = adapter.storageGet(storageKey, '');
    if (existing) return existing;
    const code = `ym-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    if (!adapter.storageSet(storageKey, code)) throw new Error('分享码保存失败，请稍后重试');
    return code;
  },
  claimWelfareReferral(referralCode, amount = 30) {
    const state = module.exports.getWelfareState();
    const code = String(referralCode || '').trim();
    if (!code) return { state, claimed: false, reward: 0, reason: 'missing' };
    if (code === module.exports.getWelfareShareCode()) return { state, claimed: false, reward: 0, reason: 'self' };
    if (state.claimedReferrals.includes(code)) return { state, claimed: false, reward: 0, reason: 'duplicate' };
    const reward = Math.max(0, Number(amount) || 0);
    const nextState = addWelfareReward(state, reward, '好友打开分享', 'referral');
    nextState.claimedReferrals = [code, ...state.claimedReferrals].slice(0, 50);
    module.exports.saveWelfareState(nextState);
    return { state: nextState, claimed: true, reward };
  },
  claimWelfareCheckIn() {
    const state = module.exports.getWelfareState();
    const today = getDateKey();
    if (state.lastCheckIn === today) return { state, claimed: false, reward: 0 };
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const nextState = addWelfareReward(state, 20, '每日签到', 'check-in');
    nextState.lastCheckIn = today;
    nextState.lastCheckInReward = 20;
    nextState.streak = state.lastCheckIn === getDateKey(yesterday) ? state.streak + 1 : 1;
    module.exports.saveWelfareState(nextState);
    return { state: nextState, claimed: true, reward: 20 };
  },
  claimWelfareTask(taskId, label, amount) {
    const state = module.exports.getWelfareState();
    const today = getDateKey();
    const claimedToday = Array.isArray(state.claimedTasks[today]) ? state.claimedTasks[today] : [];
    if (claimedToday.includes(taskId)) return { state, claimed: false, reward: 0 };
    const nextState = addWelfareReward(state, amount, label, taskId);
    nextState.claimedTasks = { ...state.claimedTasks, [today]: [...claimedToday, taskId] };
    const taskDates = Object.keys(nextState.claimedTasks).sort().slice(-14);
    nextState.claimedTasks = taskDates.reduce((result, date) => ({ ...result, [date]: nextState.claimedTasks[date] }), {});
    module.exports.saveWelfareState(nextState);
    return { state: nextState, claimed: true, reward: Math.max(0, Number(amount) || 0) };
  },
  getChatMessages: catId => adapter.storageGet(key(`chat_messages_${catId}`), []),
  saveChatMessages: (catId, messages) => write(`chat_messages_${catId}`, messages),
  getChatModel: () => adapter.storageGet(key('chat_model'), ''),
  setChatModel: modelId => write('chat_model', modelId),
  setPhotoDraft(path) { photoDraft = path || ''; },
  takePhotoDraft() { const path = photoDraft; photoDraft = ''; return path; }
};
