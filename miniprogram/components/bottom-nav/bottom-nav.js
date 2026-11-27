const adapter = require('../../utils/adapter');
const { asset } = require('../../utils/assets');

Component({
  data: {
    assets: {
      home: asset('design-webp/ui/bottom-nav-home-generated.png'),
      archive: asset('design-webp/ui/bottom-nav-archive-generated.png'),
      create: asset('design-webp/ui/bottom-nav-create-generated.png'),
      works: asset('design-webp/ui/bottom-nav-works-generated.png'),
      mine: asset('design-webp/ui/bottom-nav-mine-generated.png')
    }
  },

  properties: {
    active: {
      type: String,
      value: 'create'
    }
  },

  methods: {
    goHome() {
      adapter.reLaunch('/pages/index/index').catch(() => {});
    },

    goCats() {
      adapter.reLaunch('/pages/cats/cats').catch(() => {});
    },

    goWorks() {
      adapter.reLaunch('/subpackages/creation/works/works').catch(() => {});
    },

    goMine() {
      adapter.reLaunch('/pages/mine/mine').catch(() => {});
    },

    goCreate() {
      adapter.navigateTo('/subpackages/creation/create/create').catch(() => {});
    }
  }
});
