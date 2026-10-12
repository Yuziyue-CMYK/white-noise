// pages/scenes/scenes.js —— 场景页：预设场景 + 我的收藏
const { SOUND_DEFS } = require('../../utils/audio-engine')
const theme = require('../../utils/theme')

const app = getApp()

// 预设场景（官方推荐组合）
const PRESETS = [
  {
    name: '雨夜安眠',
    emoji: '🌧️',
    desc: '细雨 + 虫鸣，最适合入睡',
    mix: { rain: 0.6, cricket: 0.3 }
  },
  {
    name: '海边度假',
    emoji: '🌊',
    desc: '海浪 + 微风，躺在沙滩上',
    mix: { waves: 0.65, wind: 0.3 }
  },
  {
    name: '森林漫步',
    emoji: '🌲',
    desc: '鸟鸣 + 微风，清晨的树林',
    mix: { birds: 0.55, wind: 0.35 }
  },
  {
    name: '篝火晚会',
    emoji: '🔥',
    desc: '篝火 + 虫鸣，夏夜的营地',
    mix: { fire: 0.6, cricket: 0.25 }
  },
  {
    name: '山间书屋',
    emoji: '📖',
    desc: '溪流 + 微风，安静的午后',
    mix: { stream: 0.5, wind: 0.25 }
  },
  {
    name: '暴风雨夜',
    emoji: '⛈️',
    desc: '暴雨 + 微风，窗外的雨幕',
    mix: { storm: 0.6, wind: 0.3 }
  },
  {
    name: '深夜码字',
    emoji: '⌨️',
    desc: '键盘 + 细雨，灵感与专注',
    mix: { keys: 0.5, rain: 0.35 }
  },
  {
    name: 'ASMR 时刻',
    emoji: '👆',
    desc: '指弹 + 翻书，轻柔的陪伴',
    mix: { tap: 0.55, flip: 0.4 }
  }
]

Page({
  data: {
    theme: 'dark',
    presets: PRESETS,
    myScenes: []
  },

  onShow() {
    this.setData({ theme: theme.sync() })
    // 读取存储并为每个场景生成组合描述文字（WXML 不能调用方法，需预计算）
    const list = (wx.getStorageSync('my_scenes') || []).map(s => ({
      ...s,
      mixText: this.mixText(s.mix)
    }))
    this.setData({ myScenes: list })
  },

  /** 应用预设场景：停止现有声音，按组合重新播放 */
  applyPreset(e) {
    const idx = e.currentTarget.dataset.idx
    this._apply(PRESETS[idx].mix, PRESETS[idx].name)
  },

  /** 应用我保存的场景 */
  applyMine(e) {
    const idx = e.currentTarget.dataset.idx
    const scene = this.data.myScenes[idx]
    this._apply(scene.mix, scene.name)
  },

  _apply(mix, name) {
    const engine = app.globalData.engine
    engine.stopAll()
    Object.keys(mix).forEach(id => engine.play(id, mix[id]))
    // 记录为「上次现场」，主页 onShow 会自动同步
    wx.setStorageSync('last_mix', { volumes: mix, savedAt: Date.now() })
    wx.showToast({ title: `已切换：${name}`, icon: 'none' })
    setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600)
  },

  /** 删除自定义场景 */
  deleteMine(e) {
    const idx = e.currentTarget.dataset.idx
    const scene = this.data.myScenes[idx]
    wx.showModal({
      title: '删除场景',
      content: `确定删除「${scene.name}」吗？`,
      confirmColor: '#7ee0c3',
      success: res => {
        if (!res.confirm) return
        const list = this.data.myScenes
        list.splice(idx, 1)
        wx.setStorageSync('my_scenes', list)
        this.setData({ myScenes: list })
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  /** 场景组合的文字描述，如「细雨 60% + 虫鸣 30%」 */
  mixText(mix) {
    return Object.keys(mix)
      .map(id => {
        const def = SOUND_DEFS.find(s => s.id === id)
        return (def ? def.name : id) + ' ' + Math.round(mix[id] * 100) + '%'
      })
      .join(' + ')
  }
})
