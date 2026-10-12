// pages/about/about.js —— 关于页
const theme = require('../../utils/theme')

Page({
  data: {
    theme: 'dark',
    team: getApp().globalData.team,
    natureSounds: [
      '🌧️ 细雨', '⛈️ 暴雨', '🌊 海浪', '🍃 微风',
      '🏞️ 溪流', '🔥 篝火', '🐦 鸟鸣', '🌙 虫鸣'
    ],
    asmrSounds: ['👆 指弹', '⌨️ 键盘', '📖 翻书']
  },

  onShow() {
    this.setData({ theme: theme.sync() })
  }
})
