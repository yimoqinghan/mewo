const adapter = require('../../utils/adapter');
const storage = require('../../utils/storage');

const TYPES = [
  { id: 'feedback', title: '问题反馈', desc: 'Bug · 体验报错' },
  { id: 'suggestion', title: '产品建议', desc: '功能许愿 · 脑洞投稿' }
];

Page({
  data: {
    types: TYPES,
    type: 'feedback',
    title: '',
    content: '',
    contact: '',
    attachmentPath: '',
    submitting: false,
    submitted: false,
    submittedTypeTitle: '问题反馈'
  },

  onLoad(options) {
    const type = TYPES.some((item) => item.id === options?.type) ? options.type : 'feedback';
    const selected = TYPES.find((item) => item.id === type) || TYPES[0];
    this.setData({ type, submittedTypeTitle: selected.title });
  },

  selectType(event) {
    if (this.data.submitting || this.data.submitted) return;
    const type = event.currentTarget.dataset.type || 'feedback';
    const selected = TYPES.find((item) => item.id === type) || TYPES[0];
    this.setData({ type, submittedTypeTitle: selected.title });
  },

  onFieldInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!['title', 'content', 'contact'].includes(field)) return;
    this.setData({ [field]: event.detail.value || '' });
  },

  async chooseScreenshot() {
    if (this.data.submitting || this.data.submitted) return;
    try {
      const path = await adapter.chooseImage(['album']);
      this.setData({ attachmentPath: path });
    } catch (error) {
      if (!adapter.isCancel(error)) adapter.showToast('读取图片失败，请重试');
    }
  },

  previewScreenshot() {
    if (this.data.attachmentPath) adapter.previewImage(this.data.attachmentPath);
  },

  removeScreenshot() {
    if (this.data.submitting || this.data.submitted) return;
    this.setData({ attachmentPath: '' });
  },

  submit() {
    if (this.data.submitting || this.data.submitted) return;
    const content = String(this.data.content || '').trim();
    if (!content) {
      adapter.showToast(this.data.type === 'feedback' ? '请描述遇到的问题' : '请写下你的想法');
      return;
    }
    this.setData({ submitting: true });
    try {
      const savedRecords = storage.getFeedbackRecords();
      const records = Array.isArray(savedRecords) ? savedRecords : [];
      const selected = TYPES.find((item) => item.id === this.data.type) || TYPES[0];
      const record = {
        id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: this.data.type,
        typeTitle: selected.title,
        title: String(this.data.title || '').trim(),
        content,
        contact: String(this.data.contact || '').trim(),
        attachmentPath: this.data.attachmentPath || '',
        status: 'pending',
        createdAt: Date.now()
      };
      storage.saveFeedbackRecords([record, ...records].slice(0, 50));
      try { storage.claimWelfareTask('feedback', '参与产品共创', 20); } catch (rewardError) { /* 喵币记录失败不影响反馈提交 */ }
      this.setData({ submitting: false, submitted: true, submittedTypeTitle: selected.title });
      adapter.showToast('已收到，谢谢你的共创');
    } catch (error) {
      this.setData({ submitting: false });
      adapter.showToast(error.message || '保存失败，请稍后重试');
    }
  },

  resetForm() {
    this.setData({ title: '', content: '', contact: '', attachmentPath: '', submitting: false, submitted: false });
  },

  goBack() {
    adapter.navigateBack();
  }
});
