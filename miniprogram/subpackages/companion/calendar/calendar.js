const adapter = require('../../../utils/adapter');
const storage = require('../../../utils/storage');
const { asset } = require('../../../utils/assets');
const { dateKey, getMonthGrid, shiftMonth, sortEvents } = require('../../../utils/calendar');
const { getActiveCats } = require('../../../utils/cat-archive');

const EVENT_TYPES = [
  { key: 'birthday', label: '生日', color: 'pink' },
  { key: 'deworming', label: '驱虫', color: 'yellow' },
  { key: 'vaccine', label: '疫苗', color: 'blue' },
  { key: 'checkup', label: '体检', color: 'purple' },
  { key: 'custom', label: '其他', color: 'green' }
];

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function typeInfo(type) {
  return EVENT_TYPES.find((item) => item.key === type) || EVENT_TYPES[EVENT_TYPES.length - 1];
}

function dateLabel(value) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${year}年${Number(month)}月${Number(day)}日` : '选择日期';
}

function emptyForm(date) {
  return { title: '', type: 'custom', date, notes: '' };
}

Page({
  data: {
    assets: {
      calendar: asset('submodule-icons-v2/presence-calendar.webp'),
      eventMarker: asset('calendar/cat-event-marker-v2.webp')
    },
    weekLabels: WEEK_LABELS,
    eventTypes: EVENT_TYPES,
    cats: [],
    catNames: [],
    catIndex: 0,
    currentCatId: '',
    currentCatName: '还没有喵档案',
    hasCats: false,
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    monthTitle: '',
    days: [],
    selectedDate: dateKey(),
    selectedDateLabel: dateLabel(dateKey()),
    events: [],
    selectedEvents: [],
    showEditor: false,
    editingId: '',
    form: emptyForm(dateKey())
  },

  onLoad() {
    this.loadCats();
  },

  onShow() {
    this.loadCats();
  },

  loadCats() {
    const cats = getActiveCats(storage.getCats());
    const storedId = storage.getCurrentCatId();
    const currentCat = cats.find((cat) => cat.id === storedId) || cats[0];
    const currentCatId = currentCat?.id || '';
    if (currentCatId && currentCatId !== storedId) storage.setCurrentCatId(currentCatId);
    const catIndex = Math.max(0, cats.findIndex((cat) => cat.id === currentCatId));
    this.setData({
      cats,
      catNames: cats.map((cat) => cat.name || '未命名喵'),
      catIndex,
      currentCatId,
      currentCatName: currentCat?.name || '还没有喵档案',
      hasCats: cats.length > 0
    });
    this.loadEvents(currentCatId);
  },

  loadEvents(catId = this.data.currentCatId) {
    const events = sortEvents(storage.getCalendarEvents().filter((event) => String(event.catId) === String(catId)))
      .map((event) => ({ ...event, ...typeInfo(event.type), typeLabel: typeInfo(event.type).label }));
    this.setData({ events });
    this.renderCalendar(events);
  },

  renderCalendar(events = this.data.events) {
    const days = getMonthGrid(this.data.year, this.data.month, events).map((day) => ({
      ...day,
      selected: day.date === this.data.selectedDate
    }));
    const selectedEvents = events.filter((event) => event.date === this.data.selectedDate);
    this.setData({
      monthTitle: `${this.data.year}年${this.data.month + 1}月`,
      days,
      selectedEvents,
      selectedDateLabel: dateLabel(this.data.selectedDate)
    });
  },

  onCatChange(event) {
    const index = Number(event.detail.value) || 0;
    const cat = this.data.cats[index];
    if (!cat) return;
    storage.setCurrentCatId(cat.id);
    this.setData({ catIndex: index, currentCatId: cat.id, currentCatName: cat.name || '未命名喵' });
    this.loadEvents(cat.id);
  },

  selectDate(event) {
    const selectedDate = event.currentTarget.dataset.date;
    if (!selectedDate) return;
    this.setData({ selectedDate });
    this.renderCalendar(this.data.events);
  },

  changeMonth(event) {
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    const next = shiftMonth(this.data.year, this.data.month, delta);
    const selectedDate = `${next.year}-${String(next.month + 1).padStart(2, '0')}-01`;
    this.setData({ year: next.year, month: next.month, selectedDate });
    this.renderCalendar(this.data.events);
  },

  goToday() {
    const today = new Date();
    this.setData({ year: today.getFullYear(), month: today.getMonth(), selectedDate: dateKey(today) });
    this.renderCalendar(this.data.events);
  },

  openEditor(event) {
    if (!this.data.hasCats) {
      adapter.showToast('先创建喵档案，再添加日历提醒');
      return;
    }
    const editingId = event?.currentTarget?.dataset?.id || '';
    const editing = this.data.events.find((item) => item.id === editingId);
    this.setData({
      showEditor: true,
      editingId,
      form: editing ? { title: editing.title, type: editing.type, date: editing.date, notes: editing.notes || '' } : emptyForm(this.data.selectedDate)
    });
  },

  closeEditor() {
    this.setData({ showEditor: false, editingId: '' });
  },

  stopTap() {},

  onFormInput(event) {
    const field = event.currentTarget.dataset.field;
    if (!['title', 'notes'].includes(field)) return;
    this.setData({ [`form.${field}`]: event.detail.value || '' });
  },

  selectType(event) {
    const type = event.currentTarget.dataset.type;
    if (EVENT_TYPES.some((item) => item.key === type)) this.setData({ 'form.type': type });
  },

  onDateChange(event) {
    this.setData({ 'form.date': event.detail.value });
  },

  saveEvent() {
    const title = String(this.data.form.title || '').trim();
    const date = String(this.data.form.date || '').trim();
    if (!title) return adapter.showToast('给这条提醒写个名字吧');
    if (!date) return adapter.showToast('请选择提醒日期');
    const allEvents = storage.getCalendarEvents();
    const editing = Boolean(this.data.editingId);
    const now = Date.now();
    const eventData = {
      id: this.data.editingId || `calendar-${now}-${Math.random().toString(36).slice(2, 8)}`,
      catId: this.data.currentCatId,
      title,
      type: this.data.form.type,
      date,
      notes: String(this.data.form.notes || '').trim(),
      completed: editing ? Boolean(allEvents.find((item) => item.id === this.data.editingId)?.completed) : false,
      createdAt: editing ? (allEvents.find((item) => item.id === this.data.editingId)?.createdAt || now) : now,
      updatedAt: now
    };
    const next = this.data.editingId
      ? allEvents.map((item) => item.id === this.data.editingId ? eventData : item)
      : [eventData, ...allEvents];
    storage.saveCalendarEvents(next);
    this.setData({ showEditor: false, editingId: '', selectedDate: date, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) - 1 });
    this.loadEvents(this.data.currentCatId);
    adapter.showToast(editing ? '提醒已更新' : '已记下这个日子');
  },

  toggleEvent(event) {
    const id = event.currentTarget.dataset.id;
    const allEvents = storage.getCalendarEvents();
    const target = allEvents.find((item) => item.id === id);
    if (!target) return;
    storage.saveCalendarEvents(allEvents.map((item) => item.id === id ? { ...item, completed: !item.completed, updatedAt: Date.now() } : item));
    this.loadEvents(this.data.currentCatId);
  },

  deleteEvent(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.events.find((item) => item.id === id);
    if (!target) return;
    adapter.showModal({ title: `删除“${target.title}”？`, content: '删除后无法恢复这条提醒。', confirmText: '删除', confirmColor: '#D84E80' })
      .then((result) => {
        if (!result.confirm) return;
        storage.saveCalendarEvents(storage.getCalendarEvents().filter((item) => item.id !== id));
        this.loadEvents(this.data.currentCatId);
      })
      .catch(() => {});
  },

  createCat() {
    adapter.navigateTo('/pages/cat-edit/cat-edit');
  },

  goBack() {
    adapter.navigateBack().catch(() => adapter.reLaunch('/pages/index/index'));
  }
});
