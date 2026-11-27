const storage = require('../../../utils/storage');
const adapter = require('../../../utils/adapter');
const api = require('../../../services/api');
const { TOP_CHAT_MODELS, personaText } = require('../../../services/chat');
const { asset } = require('../../../utils/assets');
const { mergeMessages, sortMessages } = require('../../../utils/chat-history');
const { getActiveCats } = require('../../../utils/cat-archive');

function safeMessage(text, role) {
  return {
    id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    text,
    source: 'model-chat',
    createdAt: Date.now()
  };
}

function formatMessageTime(timestamp) {
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const THINKING_LINES = [
  '猫爪正在组织语言…',
  '我先把尾巴绕两圈，再认真回答你…',
  '正在翻找今天最合适的喵喵词…',
  '让我想一句既可爱又不敷衍的话…',
  '耳朵竖起来了，正在听你说…'
];

Page({
  data: {
    cats: [],
    currentCat: null,
    messages: [],
    draft: '',
    models: TOP_CHAT_MODELS,
    selectedModelId: TOP_CHAT_MODELS[0].id,
    selectedModel: TOP_CHAT_MODELS[0],
    showModelPicker: false,
    lastMessageId: '',
    locked: false,
    isVip: false,
    chatRemaining: null,
    chatDailyLimit: 30,
    assets: { fallbackCat: asset('design-webp/cat-home.webp'), brandCat: asset('brand-cat.png') }
  },

  async onLoad(options) {
    this.requestedCatId = options?.catId || '';
    await this.loadCats();
  },

  async onShow() {
    if (!this.loaded) await this.loadCats();
    else if (this.data.currentCat && !this.sending) this.refreshChatHistory(this.data.currentCat.id);
    this.loadQuota();
  },

  async refreshChatHistory(catId) {
    const messages = await this.loadChatHistory(catId);
    if (this.data.currentCat?.id !== catId) return;
    this.setData({ messages, lastMessageId: this.lastMessageId(messages) });
  },

  async loadQuota() {
    if (!api.isLoggedIn()) return;
    try {
      const data = await api.getQuota();
      const quota = data.quota || {};
      this.setData({
        isVip: Boolean(quota.isVip),
        chatRemaining: quota.chatRemaining,
        chatDailyLimit: quota.chatDailyLimit || 30
      });
    } catch {
      // 额度展示失败不阻塞聊天，发送时仍由服务端校验。
    }
  },

  async loadCats() {
    this.loaded = true;
    let cats = getActiveCats(storage.getCats());
    if (api.isLoggedIn()) {
      try { cats = getActiveCats(await api.syncCats()); }
      catch (error) {
        if (!api.isLoginError(error)) adapter.showToast(error.message || '喵档案加载失败');
      }
    }

    if (!cats.length) {
      this.setData({ cats: [], currentCat: null, locked: true });
      return;
    }

    const currentId = this.requestedCatId || storage.getCurrentCatId() || cats[0].id;
    const rawCat = cats.find((cat) => cat.id === currentId) || cats[0];
    const currentCat = { ...rawCat, avatar: rawCat.avatar?.url || rawCat.avatar || asset('design-webp/cat-home.webp') };
    storage.setCurrentCatId(currentCat.id);
    const storedModelId = storage.getChatModel();
    const selectedModel = TOP_CHAT_MODELS.find((model) => model.id === storedModelId) || TOP_CHAT_MODELS[0];
    const selectedModelId = selectedModel.id;
    // 旧版本保存过展示名别名，升级后统一迁移到真实上游模型 ID。
    if (storedModelId !== selectedModelId) storage.setChatModel(selectedModelId);
    const messages = await this.loadChatHistory(currentCat.id);
    this.setData({
      cats,
      currentCat,
      locked: false,
      messages,
      lastMessageId: this.lastMessageId(messages),
      selectedModelId: selectedModel.id,
      selectedModel
    });
  },

  getSavedMessages(catId) {
    const saved = storage.getChatMessages(catId);
    // 清掉早期本地模拟回复，避免它们继续伪装成真实模型对话。
    const messages = Array.isArray(saved) ? saved.filter((item) => item && item.source === 'model-chat' && !item.pending) : [];
    if (messages.length !== saved.length) storage.saveChatMessages(catId, messages);
    return this.decorateMessages(sortMessages(messages));
  },

  normalizeRemoteMessage(item) {
    const rawTime = item.createdAt || item.created_at || Date.now();
    const timestamp = typeof rawTime === 'number' ? rawTime : Date.parse(rawTime);
    return {
      id: item.id || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      clientMessageId: item.clientMessageId || item.client_message_id || '',
      role: item.role,
      text: item.text || item.content || '',
      source: 'model-chat',
      createdAt: Number.isFinite(timestamp) ? timestamp : Date.now()
    };
  },

  async loadChatHistory(catId) {
    const localMessages = this.getSavedMessages(catId);
    if (!api.isLoggedIn()) return localMessages;
    try {
      const data = await api.listChatMessages(catId, 200);
      let remoteItems = data.items || [];
      const remoteMessages = remoteItems
        .map((item) => this.normalizeRemoteMessage(item))
        .filter((item) => item.text);
      const messagesBeforeImport = mergeMessages(localMessages, remoteMessages);
      const remoteKeys = new Set(remoteMessages.flatMap((item) => [item.id, item.clientMessageId].filter(Boolean)));
      const unsyncedLocalMessages = localMessages.filter((item) => {
        const keys = [item.id, item.clientMessageId].filter(Boolean);
        return keys.length && !keys.some((key) => remoteKeys.has(key));
      });
      // 首次升级或网络中断后，把本地尚未同步的真实聊天记录补回云端。
      if (unsyncedLocalMessages.length) {
        await api.importChatMessages(catId, unsyncedLocalMessages.map((item) => ({
          id: item.id,
          role: item.role,
          text: item.text,
          createdAt: Number(item.createdAt) || Date.now()
        })));
        remoteItems = (await api.listChatMessages(catId, 200)).items || [];
      }
      const messages = this.decorateMessages(mergeMessages(
        messagesBeforeImport,
        remoteItems.map((item) => this.normalizeRemoteMessage(item)).filter((item) => item.text)
      ));
      storage.saveChatMessages(catId, messages);
      return messages;
    } catch (error) {
      if (!api.isLoginError(error)) adapter.showToast(error.message || '聊天记录加载失败，先显示本地记录');
      return localMessages;
    }
  },

  decorateMessages(messages = []) {
    let previousTimestamp = 0;
    return messages.map((item, index) => {
      const timestamp = Number(item.createdAt) || 0;
      const timeLabel = formatMessageTime(timestamp);
      const showTime = Boolean(timeLabel) && (index === 0 || timestamp - previousTimestamp > 5 * 60 * 1000);
      previousTimestamp = timestamp || previousTimestamp;
      return { ...item, showTime, timeLabel };
    });
  },

  async selectCat(event) {
    const catId = event.currentTarget.dataset.id;
    const rawCat = this.data.cats.find((cat) => cat.id === catId);
    const currentCat = rawCat && { ...rawCat, avatar: rawCat.avatar?.url || rawCat.avatar || asset('design-webp/cat-home.webp') };
    if (!currentCat) return;
    storage.setCurrentCatId(catId);
    const messages = await this.loadChatHistory(catId);
    this.setData({ currentCat, messages, lastMessageId: this.lastMessageId(messages) });
  },

  async selectCatFromPicker(event) {
    const index = Number(event.detail.value);
    const currentCat = this.data.cats[index];
    if (!currentCat) return;
    storage.setCurrentCatId(currentCat.id);
    const messages = await this.loadChatHistory(currentCat.id);
    this.setData({ currentCat: { ...currentCat, avatar: currentCat.avatar?.url || currentCat.avatar || asset('design-webp/cat-home.webp') }, messages, lastMessageId: this.lastMessageId(messages) });
  },

  lastMessageId(messages) {
    const item = messages && messages[messages.length - 1];
    return item ? `message-${item.id}` : '';
  },

  toggleModelPicker() {
    this.setData({ showModelPicker: !this.data.showModelPicker });
  },

  selectModel(event) {
    const modelId = event.currentTarget.dataset.id;
    const selectedModel = TOP_CHAT_MODELS.find((model) => model.id === modelId);
    if (!selectedModel) return;
    storage.setChatModel(modelId);
    this.setData({ selectedModelId: modelId, selectedModel, showModelPicker: false });
  },

  onInput(event) {
    this.setData({ draft: event.detail.value });
  },

  async send() {
    const text = String(this.data.draft || '').trim();
    const cat = this.data.currentCat;
    if (!cat || !text || this.sending) return;

    this.sending = true;
    const previousMessages = this.data.messages;
    const userMessage = safeMessage(text, 'user');
    const pending = safeMessage(THINKING_LINES[0], 'assistant');
    const messages = this.decorateMessages([...this.data.messages, userMessage, { ...pending, pending: true }]);
    this.setData({ messages, draft: '', lastMessageId: this.lastMessageId(messages) });
    // 先落本地，避免用户在模型回复完成前离开页面时最后一句话丢失。
    storage.saveChatMessages(cat.id, [...previousMessages, userMessage]);
    let thinkingIndex = 0;
    this.thinkingTimer = setInterval(() => {
      if (!this.sending) return;
      thinkingIndex = (thinkingIndex + 1) % THINKING_LINES.length;
      const nextMessages = this.data.messages.map((item) => item.id === pending.id ? { ...item, text: THINKING_LINES[thinkingIndex] } : item);
      this.setData({ messages: nextMessages, lastMessageId: this.lastMessageId(nextMessages) });
    }, 2200);

    try {
      if (!api.isLoggedIn()) {
        throw Object.assign(new Error('请先登录，才能连接真实聊天模型'), { code: 'LOGIN_REQUIRED' });
      }
      const history = messages
        .filter((item) => !item.pending)
        .slice(-24)
        .map((item) => ({ role: item.role, text: item.text }));
      const result = await api.sendChat({
        catId: cat.id,
        model: this.data.selectedModel.id,
        messages: history,
        userMessage: { id: userMessage.id, text: userMessage.text, createdAt: userMessage.createdAt }
      });
      const replyText = result.message?.content || result.message?.text || result.text;
      if (!replyText) throw new Error('模型没有返回有效回复，请稍后重试');
      const nextMessages = this.decorateMessages(messages.map((item) => item.id === pending.id ? { ...item, id: result.message?.id || item.id, text: replyText, pending: false, createdAt: result.message?.createdAt ? Date.parse(result.message.createdAt) : Date.now() } : item));
      this.setData({ messages: nextMessages, lastMessageId: this.lastMessageId(nextMessages) });
      storage.saveChatMessages(cat.id, nextMessages);
    } catch (error) {
      const nextMessages = previousMessages;
      this.setData({ messages: nextMessages, draft: text });
      storage.saveChatMessages(cat.id, nextMessages);
      if (error.code === 'UPSTREAM_ERROR' && error.details?.error?.code === 'model_not_found') {
        adapter.showToast('这个聊天模型暂时不可用，请换一个模型');
      } else if (error.code === 'NOT_FOUND' && /v1\/chats/.test(error.message || '')) {
        adapter.showToast('聊天服务尚未部署，请更新服务端');
      } else {
        adapter.showToast(error.message || '回复失败，请再试一次');
      }
    } finally {
      clearInterval(this.thinkingTimer);
      this.thinkingTimer = null;
      this.sending = false;
    }
  },

  onUnload() {
    clearInterval(this.thinkingTimer);
    this.thinkingTimer = null;
  },

  clearChat() {
    const cat = this.data.currentCat;
    if (!cat || !this.data.messages.length) return;
    adapter.showModal({
      title: `清空和${cat.name}的聊天？`,
      content: '聊天记录会一直保存在云端。清空后，云端记录和当前设备记录都会删除，且无法恢复。',
      confirmText: '清空',
      confirmColor: '#F66E9C'
    }).then((result) => {
      if (!result.confirm) return;
      (api.isLoggedIn() ? api.deleteChatMessages(cat.id) : Promise.resolve())
        .then(() => {
          storage.saveChatMessages(cat.id, []);
          this.setData({ messages: [], lastMessageId: '' });
        })
        .catch((error) => adapter.showToast(error.message || '清空失败，请稍后重试'));
    }).catch(() => {});
  },

  createCat() {
    adapter.navigateTo('/pages/cat-edit/cat-edit');
  },

  openCats() {
    adapter.navigateTo('/pages/cats/cats');
  },

  back() {
    adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index'));
  },

  getPersonaText() {
    return personaText(this.data.currentCat || {});
  }
});
