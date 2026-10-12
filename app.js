// app.js —— 小程序入口
const SoundEngine = require('./utils/audio-engine')

App({
  globalData: {
    // 全局共享一个音频引擎实例，保证跨页面状态一致
    engine: null,
    // 团队信息（答辩/关于页展示用）
    team: {
      name: '静界开发小组',
      leader: '于梓越',
      members: '魏婧怡'
    }
  },

  onLaunch() {
    // 惰性创建引擎：真正初始化需要用户点击（小程序音频策略）
    this.globalData.engine = new SoundEngine()
  }
})
