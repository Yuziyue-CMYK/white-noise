// pages/focus/focus.js —— 专注页：功能入口 + 今日统计
const theme = require('../../utils/theme')

Page({
  data: {
    theme: 'dark',
    todayMin: 0,   // 今日专注分钟数
    cycles: 0      // 今日完成番茄数
  },

  onShow() {
    this.setData({ theme: theme.sync() })
    this._loadStats()
  },

  _loadStats() {
    const stats = wx.getStorageSync('pomo_stats') || {}
    const today = new Date().toDateString()
    if (stats.date === today) {
      this.setData({ todayMin: stats.workMin || 0, cycles: stats.cycles || 0 })
    } else {
      this.setData({ todayMin: 0, cycles: 0 })
    }
  },

  go(e) {
    const url = e.currentTarget.dataset.url
    wx.navigateTo({ url })
  }
})
