// pages/breathe/breathe.js —— 呼吸训练
const theme = require('../../utils/theme')
const app = getApp()

// 呼吸模式：steps 为一次循环的步骤序列
// scale: 圆圈目标缩放（吸气放大、呼气缩小），dur: 秒
const MODES = [
  {
    name: '4-7-8 助眠',
    desc: '吸气 4 秒 · 屏息 7 秒 · 呼气 8 秒',
    steps: [
      { label: '吸气', dur: 4, scale: 1.0 },
      { label: '屏息', dur: 7, scale: 1.0 },
      { label: '呼气', dur: 8, scale: 0.4 }
    ]
  },
  {
    name: '箱式呼吸',
    desc: '吸气 4 秒 · 屏息 4 秒 · 呼气 4 秒 · 屏息 4 秒',
    steps: [
      { label: '吸气', dur: 4, scale: 1.0 },
      { label: '屏息', dur: 4, scale: 1.0 },
      { label: '呼气', dur: 4, scale: 0.4 },
      { label: '屏息', dur: 4, scale: 0.4 }
    ]
  }
]

Page({
  data: {
    theme: 'dark',
    modes: MODES,
    modeIdx: 0,
    running: false,
    label: '准备',       // 当前步骤文字
    scale: 0.4,          // 圆圈当前缩放
    transDur: 1,         // CSS 过渡时长（秒）
    cycleCount: 0,       // 完成循环数
    countdown: ''        // 步骤内倒计时
  },

  onShow() {
    this.setData({ theme: theme.sync() })
  },

  onHide() {
    if (this.data.running) this.stop()
  },

  onUnload() {
    if (this.data.running) this.stop()
  },

  // ---------------- 模式切换 ----------------

  pickMode(e) {
    if (this.data.running) {
      wx.showToast({ title: '训练中无法切换', icon: 'none' })
      return
    }
    this.setData({
      modeIdx: e.currentTarget.dataset.idx,
      cycleCount: 0,
      label: '准备',
      scale: 0.4,
      countdown: ''
    })
  },

  // ---------------- 开始 / 停止 ----------------

  toggle() {
    if (this.data.running) {
      this.stop()
    } else {
      this.start()
    }
  },

  start() {
    this.setData({ running: true, cycleCount: 0 })
    this._stepIdx = -1
    this._nextStep()
  },

  stop() {
    clearTimeout(this._stepTimer)
    clearInterval(this._countTimer)
    this._stepTimer = null
    this._countTimer = null
    this.setData({
      running: false,
      label: '已停止',
      scale: 0.4,
      transDur: 1,
      countdown: ''
    })
  },

  /** 推进到下一个呼吸步骤 */
  _nextStep() {
    const mode = MODES[this.data.modeIdx]
    this._stepIdx++

    // 一轮结束 → 计数 + 钟声轻响提示（每轮）
    if (this._stepIdx >= mode.steps.length) {
      this._stepIdx = 0
      const c = this.data.cycleCount + 1
      this.setData({ cycleCount: c })
      try { app.globalData.engine.chime() } catch (e) { /* 忽略 */ }
    }

    const step = mode.steps[this._stepIdx]
    // 圆圈动画：过渡时长 = 步骤时长（屏息保持不动）
    const animate = step.label !== '屏息'
    this.setData({
      label: step.label,
      scale: step.scale,
      transDur: animate ? step.dur : 0.3,
      countdown: String(step.dur)
    })

    // 步骤内每秒倒计时
    clearInterval(this._countTimer)
    let left = step.dur
    this._countTimer = setInterval(() => {
      left--
      if (left > 0) this.setData({ countdown: String(left) })
    }, 1000)

    // 到时进入下一步
    clearTimeout(this._stepTimer)
    this._stepTimer = setTimeout(() => this._nextStep(), step.dur * 1000)
  }
})
