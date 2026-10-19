// pages/index/index.js —— 主播放页逻辑（沉浸式）
const { SOUND_DEFS } = require('../../utils/audio-engine')
const theme = require('../../utils/theme')

const app = getApp()

// 每个声音对应的场景氛围色（CSS 渐变，无图片资源）
// 深浅两套：跟随主题切换，浅色主题用低饱和的明亮色调
const SCENE_MOODS_DARK = {
  rain:    { top: '#16223a', mid: '#1b2c4a', orb: 'rgba(96,140,220,0.20)' },
  storm:   { top: '#0e1526', mid: '#1a2340', orb: 'rgba(90,110,180,0.22)' },
  waves:   { top: '#0a2438', mid: '#123b52', orb: 'rgba(70,180,220,0.20)' },
  wind:    { top: '#12251f', mid: '#1c3a2e', orb: 'rgba(120,210,160,0.18)' },
  stream:  { top: '#10281e', mid: '#1a3c2c', orb: 'rgba(110,200,150,0.18)' },
  fire:    { top: '#241208', mid: '#3a2208', orb: 'rgba(255,150,60,0.22)' },
  birds:   { top: '#1a2a1a', mid: '#2a4026', orb: 'rgba(180,220,90,0.16)' },
  cricket: { top: '#101426', mid: '#1a2038', orb: 'rgba(140,160,255,0.18)' },
  tap:     { top: '#1a1424', mid: '#28203c', orb: 'rgba(200,150,255,0.18)' },
  keys:    { top: '#161822', mid: '#242838', orb: 'rgba(160,180,230,0.16)' },
  flip:    { top: '#20180f', mid: '#302715', orb: 'rgba(230,190,110,0.16)' }
}
const SCENE_MOODS_LIGHT = {
  rain:    { top: '#dfe7f2', mid: '#cfdcee', orb: 'rgba(96,140,220,0.14)' },
  storm:   { top: '#d8dde8', mid: '#c4cde0', orb: 'rgba(90,110,180,0.15)' },
  waves:   { top: '#d5ebf2', mid: '#bcdfe9', orb: 'rgba(70,180,220,0.14)' },
  wind:    { top: '#dcefe4', mid: '#c6e5d4', orb: 'rgba(120,210,160,0.13)' },
  stream:  { top: '#d8eee2', mid: '#c0e2cf', orb: 'rgba(110,200,150,0.13)' },
  fire:    { top: '#f2e4d5', mid: '#e8d0b8', orb: 'rgba(255,150,60,0.15)' },
  birds:   { top: '#e4eed8', mid: '#d2e4c0', orb: 'rgba(180,220,90,0.13)' },
  cricket: { top: '#dfe2f0', mid: '#ccd3e6', orb: 'rgba(140,160,255,0.13)' },
  tap:     { top: '#e9e0f2', mid: '#d9cee8', orb: 'rgba(200,150,255,0.13)' },
  keys:    { top: '#e2e5ec', mid: '#d0d6e2', orb: 'rgba(160,180,230,0.12)' },
  flip:    { top: '#f0e8da', mid: '#e4d8c2', orb: 'rgba(230,190,110,0.12)' }
}
// 默认氛围（无播放时），深浅各一套
const DEFAULT_MOOD_DARK = { top: '#0a0e18', mid: '#0e1424', orb: 'rgba(126,224,195,0.08)' }
const DEFAULT_MOOD_LIGHT = { top: '#f4f6fa', mid: '#e9edf4', orb: 'rgba(13,156,119,0.07)' }

Page({
  data: {
    theme: 'dark',
    accentColor: '#7ee0c3',  // slider 组件无法使用 CSS 变量，由 JS 注入
    sounds: [],          // 全部声音（自然 + ASMR）
    masterVolume: 90,    // 总音量（0~100）
    allPlaying: false,   // 是否有声音在播放
    mood: {},            // 当前场景氛围（背景渐变色）
    moodStyle: '',       // 组装好的 style 字符串
    activeNames: '',     // 当前播放的声音名（如"细雨 · 虫鸣"）
    timerModal: false,   // 睡眠定时弹窗
    saveModal: false,    // 保存场景弹窗
    sceneName: '',       // 新场景名称
    timerLeft: 0,        // 定时剩余秒数
    timerText: '定时',   // 底部栏定时按钮文案
    timerOptions: [
      { label: '15 分钟', value: 15 },
      { label: '30 分钟', value: 30 },
      { label: '45 分钟', value: 45 },
      { label: '60 分钟', value: 60 },
      { label: '90 分钟', value: 90 }
    ]
  },

  onLoad() {
    // 初始化声音列表
    this.setData({
      sounds: SOUND_DEFS.map(d => ({
        ...d,
        playing: false,
        volume: 60
      }))
    })
    // 恢复上次的混音现场（若有）
    const last = wx.getStorageSync('last_mix') || {}
    const vols = last.volumes || {}
    this.data.sounds.forEach(s => {
      if (vols[s.id] != null) {
        s.volume = Math.round(vols[s.id] * 100)
      }
    })
    this.setData({ sounds: this.data.sounds })
  },

  onShow() {
    this._syncTheme()
    this._syncFromEngine()
    // 恢复特效渲染（onHide 时已暂停）
    if (this._fx && !this._fxRunning) this._fxLoop()
  },

  onReady() {
    this._initFx()
  },

  onHide() {
    // 暂停特效渲染省电；音频继续后台播放
    if (this._fx && this._fxRaf) {
      this._fx.canvas.cancelAnimationFrame(this._fxRaf)
      this._fxRunning = false
    }
  },

  /** 页面隐藏/卸载不清音频：白噪声的价值就是后台持续播放 */

  // ================= 动态氛围特效（Canvas 粒子） =================

  /** 初始化特效画布：type=2d 同层渲染，铺满全屏 */
  _initFx() {
    const query = this.createSelectorQuery()
    query.select('#fx').fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : {}).pixelRatio || 2
      canvas.width = res[0].width * dpr
      canvas.height = res[0].height * dpr
      ctx.scale(dpr, dpr)
      this._particles = []
      this._t = 0
      this._flash = 0
      this._fx = { canvas, ctx, w: res[0].width, h: res[0].height }
      this._fxLoop()
    })
  },

  /** 渲染主循环 */
  _fxLoop() {
    if (!this._fx) return
    this._fxRunning = true
    const step = () => {
      this._fxStep()
      this._fxRaf = this._fx.canvas.requestAnimationFrame(step)
    }
    step()
  },

  /** 每帧：按正在播放的声音生成/更新/绘制粒子 */
  _fxStep() {
    const { ctx, w, h } = this._fx
    const light = this.data.theme === 'light'
    this._t++
    ctx.clearRect(0, 0, w, h)

    const playingIds = this.data.sounds.filter(s => s.playing).map(s => s.id)

    // 生成新粒子（波浪为程序化绘制，无粒子）
    playingIds.forEach(id => this._spawnFx(id))

    // 海浪：底部三层正弦波涌动
    if (playingIds.includes('waves')) this._drawWaves(ctx, w, h, light)

    // 暴雨：随机闪电（整屏白闪后快速衰减）
    if (playingIds.includes('storm') && Math.random() < 0.004) this._flash = 1
    if (this._flash > 0.02) {
      ctx.fillStyle = `rgba(255,255,255,${this._flash * (light ? 0.14 : 0.20)})`
      ctx.fillRect(0, 0, w, h)
      this._flash *= 0.86
    } else {
      this._flash = 0
    }

    // 更新 + 绘制粒子
    const ps = this._particles
    for (let i = ps.length - 1; i >= 0; i--) {
      if (!this._updateFx(ps[i], w, h)) { ps.splice(i, 1); continue }
      this._drawFx(ctx, ps[i], light)
    }
  },

  /** 按声音类型生成粒子（数量上限保护性能） */
  _spawnFx(id) {
    const ps = this._particles
    if (ps.length > 140) return
    const r = (a, b) => a + Math.random() * (b - a)
    const { w, h } = this._fx
    switch (id) {
      case 'rain': // 细雨：稀疏小雨点
        for (let k = 0; k < 2; k++) {
          ps.push({ type: 'rain', x: r(-30, w + 30), y: -20, len: r(12, 24), v: r(7, 10), dr: r(1, 2) })
        }
        break
      case 'storm': // 暴雨：密集长雨点
        for (let k = 0; k < 5; k++) {
          ps.push({ type: 'rain', x: r(-30, w + 30), y: -20, len: r(22, 42), v: r(13, 18), dr: r(2, 3.5) })
        }
        break
      case 'wind': // 微风：若隐若现的光点横向漂移，像风中絮语
        if (this._t % 6 === 0) {
          ps.push({ type: 'wind', x: -20, y: r(h * 0.1, h * 0.85), v: r(0.8, 1.8), ph: r(0, 6.28), r0: r(1.2, 2.4), life: 1, decay: r(0.003, 0.008) })
        }
        break
      case 'stream': // 溪流：向右下漂的水光点
        if (this._t % 3 === 0) {
          ps.push({ type: 'stream', x: r(0, w), y: r(-10, h * 0.9), vx: r(1, 2.4), vy: r(0.4, 1.2), life: r(100, 200) })
        }
        break
      case 'fire': // 篝火：底部升起的火星
        for (let k = 0; k < 2; k++) {
          ps.push({ type: 'fire', x: r(w * 0.1, w * 0.9), y: h + 10, vx: r(-0.4, 0.4), vy: -r(0.8, 2.2), r0: r(1.5, 3.5), life: 1, decay: r(0.006, 0.015) })
        }
        break
      case 'cricket': // 虫鸣：游动的萤火虫
        if (ps.filter(p => p.type === 'fly').length < 7) {
          ps.push({ type: 'fly', x: r(0, w), y: r(h * 0.2, h * 0.75), ph: r(0, 6.28), vx: r(-0.4, 0.4), vy: r(-0.25, 0.25), life: r(400, 900) })
        }
        break
      // birds / ASMR 声音不配粒子，只换背景色
    }
  },

  /** 更新粒子位置，返回 false 表示该粒子消亡 */
  _updateFx(p, w, h) {
    switch (p.type) {
      case 'rain':
        p.y += p.v; p.x += p.dr
        return p.y < h + 40
      case 'wind':
        p.x += p.v; p.ph += 0.04
        p.y += Math.sin(p.ph) * 0.5 // 轻微上下浮动
        p.life -= p.decay
        return p.life > 0 && p.x < w + 30
      case 'stream':
        p.x += p.vx; p.y += p.vy; p.life--
        return p.life > 0 && p.x < w + 20
      case 'fire':
        p.y += p.vy; p.x += p.vx
        p.vx += (Math.random() - 0.5) * 0.2 // 火星左右摇曳
        p.life -= p.decay
        return p.life > 0
      case 'fly':
        p.ph += 0.04
        p.x += p.vx + Math.sin(p.ph) * 0.3
        p.y += p.vy + Math.cos(p.ph * 0.7) * 0.2
        // 碰边折返
        if (p.x < 10 || p.x > w - 10) p.vx *= -1
        if (p.y < h * 0.15 || p.y > h * 0.85) p.vy *= -1
        p.life--
        return p.life > 0
    }
    return false
  },

  /** 绘制单个粒子（深浅主题各配色） */
  _drawFx(ctx, p, light) {
    switch (p.type) {
      case 'rain':
        ctx.strokeStyle = light ? 'rgba(70,100,160,0.28)' : 'rgba(170,200,255,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(p.x - p.dr * 2, p.y - p.len)
        ctx.stroke()
        break
      case 'wind': {
        // 光点：先淡入再淡出的呼吸感（前 1/5 生命周期淡入）
        const fadeIn = Math.min(1, (1 - p.life) * 5)
        const a = Math.max(0, p.life) * fadeIn
        ctx.fillStyle = light
          ? `rgba(60,140,105,${a * 0.5})`
          : `rgba(190,240,215,${a * 0.6})`
        // 微光晕
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r0 * 3, 0, 6.29)
        ctx.fill()
        ctx.fillStyle = light
          ? `rgba(60,140,105,${a * 0.75})`
          : `rgba(225,255,240,${a * 0.9})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r0, 0, 6.29)
        ctx.fill()
        break
      }
      case 'stream':
        ctx.fillStyle = light ? 'rgba(30,120,90,0.4)' : 'rgba(150,230,190,0.5)'
        ctx.beginPath()
        ctx.arc(p.x, p.y, 1.8, 0, 6.29)
        ctx.fill()
        break
      case 'fire': {
        const a = Math.max(0, p.life)
        // 外圈暖光
        ctx.fillStyle = `rgba(255,150,60,${a * 0.18})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r0 * 3, 0, 6.29)
        ctx.fill()
        // 火星本体
        ctx.fillStyle = `rgba(255,190,90,${a * 0.85})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r0, 0, 6.29)
        ctx.fill()
        break
      }
      case 'fly': {
        const a = 0.2 + 0.7 * Math.abs(Math.sin(p.ph)) // 呼吸式明灭
        ctx.fillStyle = `rgba(255,240,140,${a * 0.16})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 7, 0, 6.29)
        ctx.fill()
        ctx.fillStyle = `rgba(240,255,180,${a})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2, 0, 6.29)
        ctx.fill()
        break
      }
    }
  },

  /** 海浪：底部三层正弦波，相位随时间推进形成涌动 */
  _drawWaves(ctx, w, h, light) {
    for (let i = 0; i < 3; i++) {
      const baseY = h * (0.78 + i * 0.06)
      const amp = 12 + i * 6
      ctx.beginPath()
      for (let x = 0; x <= w; x += 8) {
        const y = baseY + Math.sin(x * 0.015 + this._t * (0.03 + i * 0.012)) * amp
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = light
        ? `rgba(40,120,150,${0.14 - i * 0.03})`
        : `rgba(120,200,235,${0.13 - i * 0.03})`
      ctx.lineWidth = 2
      ctx.stroke()
    }
  },

  // ---------------- 主题 ----------------

  _syncTheme() {
    const t = theme.sync()
    this.setData({
      theme: t,
      accentColor: theme.COLORS[t].accent
    })
  },

  toggleTheme() {
    const t = theme.toggle()
    this.setData({
      theme: t,
      accentColor: theme.COLORS[t].accent
    })
    // 主题切换后氛围背景换用对应色调的一套
    const playing = this.data.sounds.filter(s => s.playing)
    this._updateMood(playing)
  },

  // ---------------- 声音卡片 ----------------

  toggleSound(e) {
    const id = e.currentTarget.dataset.id
    const engine = app.globalData.engine
    const idx = this.data.sounds.findIndex(s => s.id === id)
    const sound = this.data.sounds[idx]

    if (sound.playing) {
      engine.stop(id)
      this._patchSound(idx, { playing: false })
    } else {
      engine.play(id, sound.volume / 100)
      this._patchSound(idx, { playing: true })
    }
    this._afterChange()
  },

  /** 调节单个声音音量（拖动中实时生效） */
  onVolume(e) {
    const id = e.currentTarget.dataset.id
    const v = e.detail.value
    const engine = app.globalData.engine
    const idx = this.data.sounds.findIndex(s => s.id === id)
    this._patchSound(idx, { volume: v })
    if (engine.isPlaying(id)) {
      engine.setVolume(id, v / 100)
    }
    this._afterChange()
  },

  /** 阻止滑杆拖动冒泡触发卡片点击 */
  noop() {},

  // ---------------- 总控 ----------------

  /** 一键播放/暂停：播放时恢复上次组合，无记录则默认细雨 */
  toggleAll() {
    const engine = app.globalData.engine
    if (this.data.allPlaying) {
      engine.stopAll()
      this.data.sounds.forEach((s, i) => this._patchSound(i, { playing: false }))
    } else {
      const last = wx.getStorageSync('last_mix') || {}
      const vols = last.volumes || { rain: 0.6 }
      this.data.sounds.forEach((s, i) => {
        if (vols[s.id] != null) {
          this._patchSound(i, { playing: true, volume: Math.round(vols[s.id] * 100) })
          engine.play(s.id, vols[s.id])
        }
      })
    }
    this._afterChange()
  },

  /** 总音量滑杆 */
  onMasterVolume(e) {
    const v = e.detail.value
    this.setData({ masterVolume: v })
    app.globalData.engine.setMasterVolume(v / 100)
  },

  // ---------------- 睡眠定时 ----------------

  showTimer() {
    this.setData({ timerModal: true })
  },

  hideTimer() {
    this.setData({ timerModal: false })
  },

  startTimer(e) {
    const min = e.currentTarget.dataset.min
    this.cancelTimerInner()
    this._timerLeft = min * 60
    this._fading = false

    this._timer = setInterval(() => {
      this._timerLeft--
      if (this._timerLeft <= 0) {
        // 时间到（引擎淡出回调里已 stopAll）
        this.cancelTimerInner(true)
        return
      }
      // 剩余 30 秒时开始平滑淡出，避免骤停惊醒用户
      if (this._timerLeft <= 30 && !this._fading) {
        this._fading = true
        app.globalData.engine.fadeOutAll(this._timerLeft, () => {
          this.data.sounds.forEach((s, i) => this._patchSound(i, { playing: false }))
          this._afterChange()
        })
      }
      this.setData({ timerLeft: this._timerLeft, timerText: this._fmt(this._timerLeft) })
    }, 1000)

    this.setData({
      timerLeft: this._timerLeft,
      timerText: this._fmt(this._timerLeft),
      timerModal: false
    })
    wx.showToast({ title: `将在 ${min} 分钟后停止`, icon: 'none' })
  },

  /** 取消定时（用户主动） */
  cancelTimer() {
    this.cancelTimerInner()
    wx.showToast({ title: '已取消定时', icon: 'none' })
  },

  cancelTimerInner(silent) {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    if (!silent) {
      app.globalData.engine.cancelFade()
    }
    this._fading = false
    this.setData({ timerLeft: 0, timerText: '定时', timerModal: false })
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  },

  // ---------------- 保存场景 ----------------

  openSave() {
    if (!this.data.allPlaying) {
      wx.showToast({ title: '先播放至少一个声音', icon: 'none' })
      return
    }
    this.setData({ saveModal: true, sceneName: '' })
  },

  closeSave() {
    this.setData({ saveModal: false })
  },

  onNameInput(e) {
    this.setData({ sceneName: e.detail.value })
  },

  saveScene() {
    const name = (this.data.sceneName || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入场景名称', icon: 'none' })
      return
    }
    const engine = app.globalData.engine
    const scenes = wx.getStorageSync('my_scenes') || []
    scenes.unshift({
      name: name,
      mix: engine.getMix(),
      time: new Date().toLocaleString()
    })
    if (scenes.length > 20) scenes.pop() // 最多保留 20 个
    wx.setStorageSync('my_scenes', scenes)
    this.setData({ saveModal: false })
    wx.showToast({ title: '已保存到「场景」页', icon: 'success' })
  },

  // ---------------- 工具方法 ----------------

  /** 局部更新单个声音卡片，避免整列表刷新 */
  _patchSound(idx, patch) {
    const key = `sounds[${idx}]`
    const data = {}
    Object.keys(patch).forEach(k => { data[`${key}.${k}`] = patch[k] })
    this.setData(data)
  },

  /** 任何播放状态变化后：同步总开关状态、更新氛围背景并持久化现场 */
  _afterChange() {
    const engine = app.globalData.engine
    const playing = this.data.sounds.filter(s => s.playing)
    this.setData({ allPlaying: playing.length > 0 })
    // 只在有声音在播时才存，暂停时不要覆盖（否则恢复现场为空，播放键失效）
    if (playing.length > 0) {
      const volumes = {}
      playing.forEach(s => { volumes[s.id] = s.volume / 100 })
      wx.setStorageSync('last_mix', { volumes, savedAt: Date.now() })
    }
    this._updateMood(playing)
  },

  /**
   * 根据正在播放的声音更新沉浸式背景：
   * 取音量最大的声音作为主场景，按当前主题选用深/浅色调。
   */
  _updateMood(playing) {
    const light = this.data.theme === 'light'
    const MOODS = light ? SCENE_MOODS_LIGHT : SCENE_MOODS_DARK
    const DEFAULT = light ? DEFAULT_MOOD_LIGHT : DEFAULT_MOOD_DARK
    let mood = DEFAULT
    let names = ''
    if (playing && playing.length > 0) {
      // 主场景 = 音量最大的声音
      const main = playing.reduce((a, b) => (b.volume > a.volume ? b : a))
      mood = MOODS[main.id] || DEFAULT
      names = playing.map(s => s.name).join(' · ')
    }
    // 组装背景样式（0.8s 过渡由 CSS transition 负责）
    const style =
      `background: linear-gradient(168deg, ${mood.top} 0%, ${mood.mid} 62%, ${mood.top} 100%);` +
      `box-shadow: inset 0 0 220rpx 60rpx ${mood.orb};`
    this.setData({ mood, moodStyle: style, activeNames: names })
  },

  /** 从引擎同步真实播放状态（从场景页切回来时） */
  _syncFromEngine() {
    const engine = app.globalData.engine
    const mix = engine.getMix()
    this.data.sounds.forEach((s, i) => {
      const p = mix[s.id] != null
      const patch = { playing: p }
      if (p) patch.volume = Math.round(mix[s.id] * 100)
      this._patchSound(i, patch)
    })
    const ids = Object.keys(mix)
    this.setData({ allPlaying: ids.length > 0 })
    // 同步氛围背景与当前声音名
    const playing = this.data.sounds.filter(s => mix[s.id] != null)
    this._updateMood(playing)
  }
})
