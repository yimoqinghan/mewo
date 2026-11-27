const storage = require('../../../utils/storage');
const adapter = require('../../../utils/adapter');
const { asset } = require('../../../utils/assets');

const MAP_ICON = asset('design-webp/ui/stray-cat-trace-marker-generated.png');

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp || Date.now());
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function blurCoordinate(value) {
  return Number((Math.round(Number(value) * 1000) / 1000).toFixed(3));
}

function formatRecord(record) {
  return {
    ...record,
    displayDate: formatDateTime(record.recordedAt),
    mediaLabel: record.mediaType === 'video' ? '视频记录' : '照片记录',
    behaviorLabel: record.behavior || '随手遇见',
    locationLabel: record.locationLabel || '附近位置',
    nickname: String(record.nickname || '').slice(0, 20)
  };
}

Page({
  data: {
    records: [],
    allRecords: [],
    markers: [],
    markerRecordIds: [],
    markerIconPath: MAP_ICON,
    mapCenter: { latitude: 0, longitude: 0 },
    mapReady: false,
    hasLocation: false,
    filters: [
      { key: 'all', label: '全部' },
      { key: 'month', label: '本月' },
      { key: 'image', label: '照片' },
      { key: 'video', label: '视频' }
    ],
    activeFilter: 'all',
    selectedRecord: null,
    showNicknameEditor: false,
    nicknameInput: '',
    isLocating: false,
    toastText: ''
  },

  onLoad() {
    this.preloadMarkerIcon();
    this.loadRecords();
    this.locate({ silent: true });
  },

  onShow() {
    this.loadRecords();
    if (!this.data.hasLocation && !this.data.isLocating) this.locate({ silent: true });
  },

  async preloadMarkerIcon() {
    try {
      const localPath = await adapter.downloadFile(MAP_ICON, { extension: 'png' });
      if (localPath) {
        this.setData({ markerIconPath: localPath });
        this.applyFilter(this.data.activeFilter, this.data.allRecords);
      }
    } catch (error) {
      // 网络不可用时保留 CDN 地址，页面仍可记录数据。
    }
  },

  loadRecords() {
    const allRecords = storage.getTraceRecords()
      .filter((record) => record && Number.isFinite(Number(record.latitude)) && Number.isFinite(Number(record.longitude)))
      .sort((a, b) => Number(b.recordedAt || 0) - Number(a.recordedAt || 0))
      .map(formatRecord);
    this.setData({ allRecords });
    this.applyFilter(this.data.activeFilter, allRecords);
  },

  getFilteredRecords(filterKey, records) {
    if (filterKey === 'image' || filterKey === 'video') {
      return records.filter((record) => record.mediaType === filterKey);
    }
    if (filterKey === 'month') {
      const now = new Date();
      return records.filter((record) => {
        const date = new Date(record.recordedAt);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      });
    }
    return records;
  },

  applyFilter(filterKey, sourceRecords = this.data.allRecords) {
    const records = this.getFilteredRecords(filterKey, sourceRecords);
    const markers = records.map((record, index) => ({
      id: index + 1,
      latitude: Number(record.latitude),
      longitude: Number(record.longitude),
      iconPath: this.data.markerIconPath,
      width: 44,
      height: 44,
      title: record.locationLabel || '遇见一只喵'
    }));
    const latest = records[0];
    const nextData = {
      activeFilter: filterKey,
      records,
      markers,
      markerRecordIds: records.map((record) => record.id)
    };
    if (latest) {
      nextData.mapCenter = { latitude: Number(latest.latitude), longitude: Number(latest.longitude) };
      nextData.mapReady = true;
    } else if (!this.data.hasLocation) {
      nextData.mapReady = false;
    }
    this.setData({
      ...nextData
    });
  },

  selectFilter(event) {
    this.applyFilter(event.currentTarget.dataset.key);
  },

  async startRecord() {
    if (!this.data.hasLocation) {
      await this.locate();
      if (!this.data.hasLocation) return;
    }
    const result = await adapter.showActionSheet(['拍照并记录', '拍视频并记录', '从相册选照片', '从相册选视频']).catch(() => null);
    if (!result) return;
    const actions = [
      () => this.recordPhoto('camera'),
      () => this.recordVideo('camera'),
      () => this.recordPhoto('album'),
      () => this.recordVideo('album')
    ];
    if (actions[result.tapIndex]) return actions[result.tapIndex]();
  },

  async recordPhoto(sourceType) {
    try {
      const path = await adapter.chooseImage([sourceType]);
      if (path) await this.saveMediaRecord('image', path);
    } catch (error) {
      if (!adapter.isCancel(error)) this.showToast('没有读取到照片，请重试');
    }
  },

  async recordVideo(sourceType) {
    try {
      const file = await adapter.chooseVideo({ sourceType: [sourceType], maxDuration: 30 });
      if (file?.path) await this.saveMediaRecord('video', file.path);
    } catch (error) {
      if (!adapter.isCancel(error)) this.showToast('没有读取到视频，请重试');
    }
  },

  async locate(options = {}) {
    const silent = Boolean(options.silent);
    if (this.data.isLocating) return;
    this.setData({ isLocating: true });
    try {
      const location = await adapter.getLocation({ type: 'gcj02' });
      this.setData({
        hasLocation: true,
        mapReady: true,
        mapCenter: { latitude: Number(location.latitude), longitude: Number(location.longitude) }
      });
      if (!silent) this.showToast('已定位，展示位置会自动模糊');
    } catch (error) {
      if (silent) return;
      const result = await adapter.showModal({ title: '需要定位权限', content: '开启定位后，才能把这次遇见标记到喵迹地图。', confirmText: '去开启', cancelText: '暂不开启' }).catch(() => null);
      if (result?.confirm) adapter.openSetting().catch(() => {});
    } finally {
      this.setData({ isLocating: false });
    }
  },

  async saveMediaRecord(mediaType, mediaPath) {
    if (!this.data.hasLocation || !this.data.mapCenter?.latitude || !this.data.mapCenter?.longitude) {
      this.showToast('定位失败，请稍后重试');
      return;
    }
    try {
      const now = Date.now();
      const record = {
        id: `trace-${now}-${Math.random().toString(36).slice(2, 8)}`,
        mediaType,
        mediaPath,
        latitude: blurCoordinate(this.data.mapCenter.latitude),
        longitude: blurCoordinate(this.data.mapCenter.longitude),
        locationLabel: '当前位置附近',
        nickname: '',
        behavior: '随手遇见',
        note: '',
        visibility: 'private',
        recordedAt: now,
        createdAt: now
      };
      storage.saveTraceRecords([record, ...storage.getTraceRecords()].slice(0, 200));
      this.loadRecords();
      this.showToast('已把这次遇见留在地图上');
    } catch (error) {
      this.showToast(error.message || '保存失败，请重试');
    }
  },

  stopTap() {},

  openNicknameEditor() {
    this.setData({ showNicknameEditor: true, nicknameInput: this.data.selectedRecord?.nickname || '' });
  },

  closeNicknameEditor() {
    this.setData({ showNicknameEditor: false });
  },

  onNicknameInput(event) {
    this.setData({ nicknameInput: String(event.detail.value || '').slice(0, 20) });
  },

  saveNickname() {
    const record = this.data.selectedRecord;
    if (!record) return;
    const nickname = String(this.data.nicknameInput || '').trim().slice(0, 20);
    const records = storage.getTraceRecords().map((item) => item.id === record.id ? { ...item, nickname } : item);
    storage.saveTraceRecords(records);
    const updated = records.find((item) => item.id === record.id);
    this.setData({ selectedRecord: updated ? formatRecord(updated) : record, showNicknameEditor: false });
    this.loadRecords();
    this.showToast(nickname ? `已记住“${nickname}”` : '已清除这条喵的外号');
  },

  onMarkerTap(event) {
    const markerId = Number(event.detail.markerId);
    const recordId = this.data.markerRecordIds[markerId - 1];
    const record = this.data.allRecords.find((item) => item.id === recordId);
    if (record) this.setData({ selectedRecord: record });
  },

  openRecord(event) {
    const recordId = event.currentTarget.dataset.id;
    const record = this.data.allRecords.find((item) => item.id === recordId);
    if (record) this.setData({ selectedRecord: record });
  },

  closeDetail() {
    this.setData({ selectedRecord: null, showNicknameEditor: false });
  },

  previewRecordMedia() {
    const record = this.data.selectedRecord;
    if (!record?.mediaPath || record.mediaType !== 'image') return;
    adapter.previewImage(record.mediaPath).catch(() => {});
  },

  async deleteRecord() {
    const record = this.data.selectedRecord;
    if (!record) return;
    const result = await adapter.showModal({ title: '删除这条喵迹？', content: '删除后，这条记录会从你的个人地图移除。', confirmText: '删除', cancelText: '保留' }).catch(() => null);
    if (!result?.confirm) return;
    storage.saveTraceRecords(storage.getTraceRecords().filter((item) => item.id !== record.id));
    this.setData({ selectedRecord: null, showNicknameEditor: false });
    this.loadRecords();
    this.showToast('已删除这条喵迹');
  },

  showToast(text) {
    clearTimeout(this.toastTimer);
    this.setData({ toastText: text });
    this.toastTimer = setTimeout(() => this.setData({ toastText: '' }), 2200);
  },

  onUnload() {
    clearTimeout(this.toastTimer);
  }
});
