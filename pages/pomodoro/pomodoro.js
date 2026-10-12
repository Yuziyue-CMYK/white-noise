// pages/pomodoro/pomodoro.js —— 番茄时钟
const theme = require('../../utils/theme')
const app = getApp()

// 可选的专注/休息时长方案（分钟）
const PLANS = [
  { label: '经典 25/5', work: 25, rest: 5 },
  { label: '长专注 45/15', work: 45, rest: 15 },
  { label: '轻快 15/3', work: 15, rest: 3 }
]

Page({
  data: {
    theme: 'dark',
    plans: PLANS,
    planIdx: 0,          // 当前方案
    phase: 'idle',       // idle / work / rest
    running: false,      // 计时进行中
    leftSec: 25 * 60,    // 剩余秒数
    display: '25:00',    // 大字显示
    progress: 0,         // 0~100 进度
    totalSec: 25 * 60,   // 当前阶段总时长
    cycles: 0            // 本次会话完成的番茄数
  },

  onShow() {
    this.setData({ theme: theme.sync() })
  },

  /** 页面卸载：保留计时（离开页面即暂停，避免后台计时不准） */
  onHide() {
    if (this.data.running) this.pause()
  },

  // ---------------- 方案切换 ----------------

  pickPlan(e) {
    if (this.data.running) {
      wx.showToast({ title: '计时中无法切换', icon: 'none' })
      return
    }
    const idx = e.currentTarget.dataset.idx
    const plan = PLANS[idx]
    this.setData({
      planIdx: idx,
      phase: 'idle',
      leftSec: plan.work * 60,
      totalSec: plan.work * 60,
      display: this._fmt(plan.work * 60),
      progress: 0,
      cycles: 0
    })
  },

  // ---------------- 计时控制 ----------------

  startPause() {
    if (this.data.running) {
      this.pause()
    } else {
      this.start()
    }
  },

  start() {
    if (this.data.phase === 'idle') {
      // 从空闲启动：进入专注阶段
      const plan = PLANS[this.data.planIdx]
      this.setData({
        phase: 'work',
        leftSec: plan.work * 60,
        totalSec: plan.work * 60
      })
    }
    this._tick()
    this._timer = setInterval(() => this._tick(), 1000)
    this.setData({ running: true })
  },

  pause() {
    clearInterval(this._timer)
    this._timer = null
    this.setData({ running: false })
  },

  /** 重置到空闲 */
  reset() {
    clearInterval(this._timer)
    this._timer = null
    const plan = PLANS[this.data.planIdx]
    this.setData({
      running: false,
      phase: 'idle',
      leftSec: plan.work * 60,
      totalSec: plan.work * 60,
      display: this._fmt(plan.work * 60),
      progress: 0
    })
  },

  /** 跳过当前阶段 */
  skip() {
    if (this.data.phase === 'idle') return
    this._nextPhase()
  },

  _tick() {
    const left = this.data.leftSec - 1
    if (left <= 0) {
      this._nextPhase()
      return
    }
    this.setData({
      leftSec: left,
      display: this._fmt(left),
      progress: Math.round((1 - left / this.data.totalSec) * 100)
    })
  },

  /** 阶段结束：钟声 + 振动 + 切换到下一阶段 */
  _nextPhase() {
    clearInterval(this._timer)
    this._timer = null

    // 钟声与振动提示
    try { app.globalData.engine.chime() } catch (e) { /* 引擎不可用时忽略 */ }
    wx.vibrateShort({ type: 'medium' })

    const plan = PLANS[this.data.planIdx]
    if (this.data.phase === 'work') {
      // 专注结束 → 记录统计 → 进入休息
      this._recordWork(plan.work)
      const cycles = this.data.cycles + 1
      this.setData({
        phase: 'rest',
        cycles,
        running: false,
        leftSec: plan.rest * 60,
        totalSec: plan.rest * 60,
        display: this._fmt(plan.rest * 60),
        progress: 0
      })
      wx.showToast({ title: `完成第 ${cycles} 个番茄，休息一下`, icon: 'none' })
    } else {
      // 休息结束 → 回到专注
      this.setData({
        phase: 'work',
        running: false,
        leftSec: plan.work * 60,
        totalSec: plan.work * 60,
        display: this._fmt(plan.work * 60),
        progress: 0
      })
      wx.showToast({ title: '休息结束，继续专注', icon: 'none' })
    }
  },

  /** 记录今日专注分钟数（按天归零） */
  _recordWork(min) {
    const today = new Date().toDateString()
    const stats = wx.getStorageSync('pomo_stats') || {}
    if (stats.date !== today) {
      stats.date = today
      stats.workMin = 0
      stats.cycles = 0
    }
    stats.workMin = (stats.workMin || 0) + min
    stats.cycles = (stats.cycles || 0) + 1
    wx.setStorageSync('pomo_stats', stats)
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
})
