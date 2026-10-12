// pages/meditate/meditate.js —— 正念冥想
const theme = require('../../utils/theme')
const app = getApp()

const PRESETS = [3, 5, 10, 15, 20] // 分钟

// 冥想引导语，每 20 秒轮换一句
const QUOTES = [
  '让呼吸自然地发生',
  '感受身体与地面的接触',
  '念头来了，让它轻轻地走',
  '把注意力带回到呼吸',
  '不必评判，只是觉察',
  '此刻，就是全部'
]

Page({
  data: {
    theme: 'dark',
    presets: PRESETS,
    min: 10,             // 选择的时长
    running: false,
    paused: false,
    display: '10:00',
    progress: 0,
    quote: '找一个舒服的姿势，轻轻闭上眼睛'
  },

  onShow() {
    this.setData({ theme: theme.sync() })
  },

  onHide() {
    // 离开页面自动暂停，回来可继续
    if (this.data.running && !this.data.paused) this.pause()
  },

  onUnload() {
    this._clearAll()
  },

  // ---------------- 时长选择 ----------------

  pickMin(e) {
    if (this.data.running) {
      wx.showToast({ title: '冥想中无法切换', icon: 'none' })
      return
    }
    const m = e.currentTarget.dataset.min
    this.setData({
      min: m,
      display: this._fmt(m * 60),
      progress: 0,
      quote: '找一个舒服的姿势，轻轻闭上眼睛'
    })
  },

  // ---------------- 计时 ----------------

  start() {
    const total = this.data.min * 60
    this._left = this._left || total
    if (this._left >= total) this._left = total

    // 开始钟声
    try { app.globalData.engine.chime() } catch (e) { /* 忽略 */ }

    this.setData({ running: true, paused: false })
    this._quoteIdx = 0

    this._timer = setInterval(() => {
      this._left--
      if (this._left <= 0) {
        this._finish()
        return
      }
      this.setData({
        display: this._fmt(this._left),
        progress: Math.round((1 - this._left / total) * 100)
      })
    }, 1000)

    // 引导语轮换
    this._quoteTimer = setInterval(() => {
      this._quoteIdx = (this._quoteIdx + 1) % QUOTES.length
      this.setData({ quote: QUOTES[this._quoteIdx] })
    }, 20000)
  },

  pause() {
    clearInterval(this._timer)
    clearInterval(this._quoteTimer)
    this._timer = null
    this._quoteTimer = null
    this.setData({ paused: true })
  },

  resume() {
    this._left = this._left || this.data.min * 60
    this.start()
    // start 里会重置 _left 上限，这里修正为继续剩余时间
  },

  toggle() {
    if (!this.data.running) {
      this._left = null
      this.start()
    } else if (this.data.paused) {
      this.resume()
    } else {
      this.pause()
    }
  },

  _finish() {
    this._clearAll()
    this._left = null
    try { app.globalData.engine.chime() } catch (e) { /* 忽略 */ }
    wx.vibrateShort({ type: 'light' })
    this.setData({
      running: false,
      paused: false,
      display: this._fmt(this.data.min * 60),
      progress: 100,
      quote: '冥想结束，带着这份平静回到今天'
    })
    wx.showToast({ title: '冥想完成 🧘', icon: 'none' })
  },

  _clearAll() {
    clearInterval(this._timer)
    clearInterval(this._quoteTimer)
    this._timer = null
    this._quoteTimer = null
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
})
