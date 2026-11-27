const { asset } = require('../../utils/assets');

Component({
  properties: {
    statusText: { type: String, value: 'AI 正在创作…' },
    subtitle: { type: String, value: '你可以先离开，回来继续查看' },
    stageLabel: { type: String, value: '创作准备中' },
    progressHint: { type: String, value: '模型完成后会自动展示结果' },
    progress: { type: Number, value: 0 },
    variant: { type: String, value: 'card' }
  },
  data: {
    catRunLoading: asset('design/cat-run-loading.gif')
  }
});
