/**
 * ============================================================
 * 静界 · 白噪声 —— 音频合成引擎（utils/audio-engine.js）
 * ------------------------------------------------------------
 * 设计思路：
 *   1. 不使用任何音频文件，8 种环境声全部由 Web Audio API
 *      实时合成，安装包极小、不会因为外链音频失效而无法播放；
 *   2. 连续型声音（雨/浪/风/溪流）= 噪声源 + 滤波器 + LFO 调制；
 *   3. 事件型声音（鸟鸣/虫鸣/柴火爆裂）= 定时器随机触发短音；
 *   4. 混音 = 每个声音一条独立通道，通道音量由用户滑杆控制，
 *      所有通道汇入总音量节点后输出，即「声音混合器」结构。
 *
 * 前置条件：基础库 >= 2.19.0（wx.createWebAudioContext）
 * ============================================================
 */

// ---------------- 声音定义表（页面渲染与引擎共用） ----------------
// cat: nature 自然声 / asmr ASMR 声
const SOUND_DEFS = [
  { id: 'rain',    name: '细雨',  emoji: '🌧️', desc: '淅淅沥沥的屋檐雨', build: 'rain',    cat: 'nature' },
  { id: 'storm',   name: '暴雨',  emoji: '⛈️', desc: '倾盆而下的雨幕',   build: 'storm',   cat: 'nature' },
  { id: 'waves',   name: '海浪',  emoji: '🌊', desc: '浪涌拍岸的节律',   build: 'waves',   cat: 'nature' },
  { id: 'wind',    name: '微风',  emoji: '🍃', desc: '穿过林间的风',     build: 'wind',    cat: 'nature' },
  { id: 'stream',  name: '溪流',  emoji: '🏞️', desc: '山涧流水的潺潺',  build: 'stream',  cat: 'nature' },
  { id: 'fire',    name: '篝火',  emoji: '🔥', desc: '柴火的噼啪声',     build: 'fire',    cat: 'nature' },
  { id: 'birds',   name: '鸟鸣',  emoji: '🐦', desc: '清晨婉转的鸟叫',   build: 'birds',   cat: 'nature' },
  { id: 'cricket', name: '虫鸣',  emoji: '🌙', desc: '夏夜草丛的虫声',   build: 'cricket', cat: 'nature' },
  { id: 'tap',     name: '指弹',  emoji: '👆', desc: 'ASMR 轻柔敲击',    build: 'tap',     cat: 'asmr' },
  { id: 'keys',    name: '键盘',  emoji: '⌨️', desc: '机械键盘的敲击',   build: 'keys',    cat: 'asmr' },
  { id: 'flip',    name: '翻书',  emoji: '📖', desc: '纸张翻动的沙沙',   build: 'flip',    cat: 'asmr' }
]

// 噪声缓冲区时长（秒）
const BUFFER_SECONDS = 2

class SoundEngine {
  constructor() {
    this.ctx = null          // AudioContext
    this.master = null       // 总音量节点
    this.masterVolume = 0.9  // 总音量（0~1，用户设置）
    this.buffers = {}        // 噪声缓冲区缓存 {white, pink, brown}
    this.channels = {}       // 正在播放的通道 {id: {def, volume, gain, parts, timers}}
    this._fadeTimer = null   // 睡眠定时淡出句柄
  }

  /**
   * 初始化 / 唤醒 AudioContext。
   * 小程序要求音频必须在用户手势后启动，因此每个入口按钮
   * 都先调用 init()。
   */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return this.ctx
    }
    this.ctx = wx.createWebAudioContext()
    this.master = this.ctx.createGain()
    // 感知音量曲线：v^2 让小音量区间调节更细腻
    this.master.gain.value = this.masterVolume * this.masterVolume
    this.master.connect(this.ctx.destination)
    return this.ctx
  }

  /* ================= 基础节点工厂 ================= */

  /** 生成噪声缓冲区：white / pink / brown */
  _buffer(type) {
    if (this.buffers[type]) return this.buffers[type]
    const sr = this.ctx.sampleRate
    const len = sr * BUFFER_SECONDS
    const buf = this.ctx.createBuffer(1, len, sr)
    const d = buf.getChannelData(0)

    if (type === 'white') {
      // 白噪声：完全随机的均匀分布，能量遍布全频段
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    } else if (type === 'pink') {
      // 粉噪声：Paul Kellet 近似滤波，每倍频能量相等，听感更柔和
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.96900 * b2 + w * 0.1538520
        b3 = 0.86650 * b3 + w * 0.3104856
        b4 = 0.55000 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.0168980
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    } else {
      // 布朗噪声：对白噪声积分，低频能量强，像远处的轰鸣
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    this.buffers[type] = buf
    return buf
  }

  /** 创建循环播放的噪声源 */
  _noiseSource(type) {
    const src = this.ctx.createBufferSource()
    src.buffer = this._buffer(type)
    src.loop = true
    return src
  }

  /** 创建双二阶滤波器 */
  _filter(type, freq, q) {
    const f = this.ctx.createBiquadFilter()
    f.type = type // highpass / lowpass / bandpass
    f.frequency.value = freq
    if (q != null) f.Q.value = q
    return f
  }

  /** 创建增益节点 */
  _gain(v) {
    const g = this.ctx.createGain()
    g.gain.value = v
    return g
  }

  /**
   * 创建低频振荡器（LFO），用于让声音「活」起来：
   * 海浪的起伏、风的强弱变化都靠它调制目标参数。
   * @param freq   振荡频率（Hz），越小变化越慢
   * @param param  被调制的 AudioParam（如 gain.gain / filter.frequency）
   * @param depth  调制深度（叠加在参数原值上）
   */
  _lfo(freq, param, depth) {
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const dep = this._gain(depth)
    osc.connect(dep)
    dep.connect(param)
    osc.start()
    return osc
  }

  _rand(min, max) {
    return min + Math.random() * (max - min)
  }

  /* ================= 通道生命周期 ================= */

  /**
   * 播放一个声音（不存在则创建通道）
   * @param id     声音 id，见 SOUND_DEFS
   * @param volume 0~1 通道音量
   */
  play(id, volume) {
    this.init()
    if (this.channels[id]) {
      if (volume != null) this.setVolume(id, volume)
      return
    }
    const def = SOUND_DEFS.find(s => s.id === id)
    if (!def) return

    const ch = {
      def: def,
      volume: volume == null ? 0.6 : volume, // 用户音量
      gain: null,   // 通道音量节点（链尾）
      parts: [],    // 需要在 stop 时清理的节点（source/oscillator）
      timers: []    // 事件型声音的定时器
    }
    ch.gain = this._gain(ch.volume * ch.volume)
    ch.gain.connect(this.master)
    this.channels[id] = ch

    // 按声音类型构建音频图
    this['_' + def.build](ch)
  }

  /** 停止一个声音：清理节点与定时器，防止内存泄漏 */
  stop(id) {
    const ch = this.channels[id]
    if (!ch) return
    ch.timers.forEach(t => {
      clearInterval(t)
      clearTimeout(t)
    })
    ch.parts.forEach(p => {
      try { p.stop ? p.stop() : p.disconnect() } catch (e) { /* 已停止 */ }
    })
    try { ch.gain.disconnect() } catch (e) { /* 已断开 */ }
    delete this.channels[id]
  }

  stopAll() {
    Object.keys(this.channels).forEach(id => this.stop(id))
  }

  /** 调节通道音量（0~1），使用 setTargetAtTime 平滑过渡避免爆音 */
  setVolume(id, v) {
    const ch = this.channels[id]
    if (!ch) return
    ch.volume = v
    ch.gain.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.05)
  }

  /** 调节总音量（0~1） */
  setMasterVolume(v) {
    this.masterVolume = v
    if (this.master) {
      this.master.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.05)
    }
  }

  isPlaying(id) {
    return !!this.channels[id]
  }

  /** 返回当前混音快照 {id: volume}，用于保存场景/恢复现场 */
  getMix() {
    const mix = {}
    Object.keys(this.channels).forEach(id => {
      mix[id] = this.channels[id].volume
    })
    return mix
  }

  /* ================= 各声音的音频图构建 ================= */

  /** 细雨：白噪声削去极端频率，听感像连绵的沙沙声 */
  _rain(ch) {
    const src = this._noiseSource('white')
    const hp = this._filter('highpass', 250)   // 去掉低频轰隆
    const lp = this._filter('lowpass', 5200)   // 去掉刺耳高频
    const g = this._gain(0.5)
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ch.gain)
    src.start()
    ch.parts.push(src)
  }

  /** 暴雨：更宽的能量 + 低频雷雨轰鸣，音量明显大于细雨 */
  _storm(ch) {
    const src = this._noiseSource('white')
    const hp = this._filter('highpass', 150)
    const lp = this._filter('lowpass', 3200)
    const g = this._gain(0.65)
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ch.gain)
    src.start()
    ch.parts.push(src)

    const rumble = this._noiseSource('brown')
    const rlp = this._filter('lowpass', 160)
    const rg = this._gain(0.5)
    rumble.connect(rlp); rlp.connect(rg); rg.connect(ch.gain)
    rumble.start()
    ch.parts.push(rumble)
  }

  /** 海浪：布朗噪声低通 + 0.08Hz 慢速 LFO 制造「一阵阵」的浪涌 */
  _waves(ch) {
    const src = this._noiseSource('brown')
    const lp = this._filter('lowpass', 480, 0.8)
    const g = this._gain(0.45)
    src.connect(lp); lp.connect(g); g.connect(ch.gain)
    src.start()
    ch.parts.push(src)

    // 浪涌起伏：增益在 0.10 ~ 0.80 之间缓慢摆动
    ch.parts.push(this._lfo(0.08, g.gain, 0.35))
    // 浪峰到来时滤掉的噪声少一些，声音更「亮」
    ch.parts.push(this._lfo(0.08, lp.frequency, 120))
  }

  /** 微风：粉噪声 + 低通，LFO 同时调制音量与截止频率 */
  _wind(ch) {
    const src = this._noiseSource('pink')
    const lp = this._filter('lowpass', 420, 1.0)
    const g = this._gain(0.5)
    src.connect(lp); lp.connect(g); g.connect(ch.gain)
    src.start()
    ch.parts.push(src)

    ch.parts.push(this._lfo(0.12, lp.frequency, 180))
    ch.parts.push(this._lfo(0.07, g.gain, 0.18))
  }

  /** 溪流：白噪声带通 2600Hz，快速小幅 LFO 制造水花的跳动 */
  _stream(ch) {
    const src = this._noiseSource('white')
    const bp = this._filter('bandpass', 2600, 0.5)
    const g = this._gain(0.35)
    src.connect(bp); bp.connect(g); g.connect(ch.gain)
    src.start()
    ch.parts.push(src)

    ch.parts.push(this._lfo(0.4, bp.frequency, 600))
  }

  /** 篝火：布朗噪声做底火 + 随机定时器触发高频「噼啪」爆裂 */
  _fire(ch) {
    // 底火：持续的低频燃烧声
    const src = this._noiseSource('brown')
    const lp = this._filter('lowpass', 220)
    const g = this._gain(0.6)
    src.connect(lp); lp.connect(g); g.connect(ch.gain)
    src.start()
    ch.parts.push(src)

    // 爆裂：高通白噪声平时增益为 0，由随机定时器「点火」
    const crackle = this._noiseSource('white')
    const chp = this._filter('highpass', 2800)
    const cg = this._gain(0)
    crackle.connect(chp); chp.connect(cg); cg.connect(ch.gain)
    crackle.start()
    ch.parts.push(crackle)

    // 每次爆裂间隔 60~400ms 随机，模拟柴火的不规则噼啪
    // 定时器 id 固定存在 ch.timers[0]，避免数组无限增长
    const schedule = () => {
      if (!this.channels.fire) return
      const t = this.ctx.currentTime
      cg.gain.cancelScheduledValues(t)
      cg.gain.setValueAtTime(0.001, t)
      // 4ms 内冲到峰值（随机强度），60ms 内指数衰减回 0
      cg.gain.linearRampToValueAtTime(this._rand(0.15, 0.8), t + 0.004)
      cg.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
      ch.timers[0] = setTimeout(schedule, this._rand(60, 400))
    }
    schedule()
  }

  /** 鸟鸣：无连续声源，定时器随机触发 1~3 声正弦扫频「啾」声 */
  _birds(ch) {
    const scheduleChirp = () => {
      const notes = Math.floor(this._rand(1, 4)) // 一次叫 1~3 声
      let t = this.ctx.currentTime
      for (let n = 0; n < notes; n++) {
        const osc = this.ctx.createOscillator()
        osc.type = 'sine'
        // 基频随机在 2600~3800Hz，模拟不同小鸟
        const f0 = this._rand(2600, 3800)
        const g = this._gain(0)
        osc.connect(g); g.connect(ch.gain)
        osc.frequency.setValueAtTime(f0, t)
        osc.frequency.linearRampToValueAtTime(f0 * 0.78, t + 0.08) // 下滑
        osc.frequency.linearRampToValueAtTime(f0 * 1.15, t + 0.16) // 上扬
        // 音量包络：快起缓落
        g.gain.setValueAtTime(0.001, t)
        g.gain.linearRampToValueAtTime(0.4, t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
        osc.start(t)
        osc.stop(t + 0.2)
        t += this._rand(0.15, 0.3) // 两声之间的间隔
      }
    }
    const loop = () => {
      if (!this.channels.birds) return
      scheduleChirp()
      // 2~6 秒随机间隔叫一次，定时器 id 固定在 ch.timers[0]
      ch.timers[0] = setTimeout(loop, this._rand(2000, 6000))
    }
    loop()
  }

  /** 虫鸣：4.3kHz 正弦持续音 + 定时器触发断续脉冲串，像蟋蟀振翅 */
  _cricket(ch) {
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = 4300
    const g = this._gain(0)
    osc.connect(g); g.connect(ch.gain)
    osc.start()
    ch.parts.push(osc)

    const burst = () => {
      if (!this.channels.cricket) return
      const pulses = Math.floor(this._rand(6, 10)) // 一串 6~10 个脉冲
      let t = this.ctx.currentTime
      for (let k = 0; k < pulses; k++) {
        g.gain.setValueAtTime(0.001, t)
        g.gain.linearRampToValueAtTime(0.22, t + 0.01)
        g.gain.linearRampToValueAtTime(0.001, t + 0.06)
        t += 0.12
      }
    }
    const loop = () => {
      if (!this.channels.cricket) return
      burst()
      ch.timers[0] = setTimeout(loop, this._rand(1800, 4500))
    }
    loop()
  }

  /* ================= ASMR 声音 ================= */

  /** 指弹（ASMR）：随机间隔的低频闷响，像指尖轻敲桌面 */
  _tap(ch) {
    const thump = () => {
      if (!this.channels.tap) return
      const t = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      const g = this._gain(0)
      osc.connect(g); g.connect(ch.gain)
      // 频率从 210Hz 快速滑落到 70Hz，形成柔软的"咚"声
      osc.frequency.setValueAtTime(210, t)
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.09)
      g.gain.setValueAtTime(0.001, t)
      g.gain.linearRampToValueAtTime(0.9, t + 0.006)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
      osc.start(t)
      osc.stop(t + 0.15)
      ch.timers[0] = setTimeout(thump, this._rand(400, 1100))
    }
    thump()
  }

  /** 键盘（ASMR）：短促的高频噪声点击，模拟机械键盘敲击 */
  _keys(ch) {
    const click = () => {
      if (!this.channels.keys) return
      const t = this.ctx.currentTime
      const n = this._noiseSource('white')
      const hp = this._filter('highpass', 3000)
      const g = this._gain(0)
      n.connect(hp); hp.connect(g); g.connect(ch.gain)
      // 极短的噪声突发：20ms 衰减，脆而轻
      g.gain.setValueAtTime(0.5, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.02)
      n.start(t)
      n.stop(t + 0.03)
      ch.timers[0] = setTimeout(click, this._rand(90, 350))
    }
    click()
  }

  /** 翻书（ASMR）：带通噪声的扫频沙沙声，带纸页拂过的质感 */
  _flip(ch) {
    const swish = () => {
      if (!this.channels.flip) return
      const t = this.ctx.currentTime
      const n = this._noiseSource('white')
      const bp = this._filter('bandpass', 1200, 0.7)
      const g = this._gain(0)
      n.connect(bp); bp.connect(g); g.connect(ch.gain)
      // 中心频率从 600Hz 扫到 2400Hz，像纸页从耳边划过
      bp.frequency.setValueAtTime(600, t)
      bp.frequency.linearRampToValueAtTime(2400, t + 0.18)
      g.gain.setValueAtTime(0.001, t)
      g.gain.linearRampToValueAtTime(0.35, t + 0.05)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
      n.start(t)
      n.stop(t + 0.25)
      ch.timers[0] = setTimeout(swish, this._rand(2000, 6000))
    }
    swish()
  }

  /**
   * 钟声提示音：供番茄钟 / 冥想 / 呼吸完成时调用。
   * 三个泛音叠加（基频 880Hz），长衰减，柔和如颂钵。
   * 注意：直接连接输出设备，不经过 master，不受睡眠淡出影响。
   */
  chime() {
    this.init()
    const t = this.ctx.currentTime
    const g = this.ctx.createGain()
    g.connect(this.ctx.destination)
    g.gain.setValueAtTime(0.001, t)
    g.gain.linearRampToValueAtTime(0.5, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3)
    const partials = [
      { f: 880,    amp: 1.0 },
      { f: 1318.5, amp: 0.4 }, // E6，纯五度泛音
      { f: 1760,   amp: 0.2 }  // A7，八度泛音
    ]
    partials.forEach(p => {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = p.f
      const og = this._gain(p.amp)
      osc.connect(og); og.connect(g)
      osc.start(t)
      osc.stop(t + 3)
    })
  }

  /* ================= 睡眠定时淡出 ================= */

  /**
   * 在 seconds 秒内把总音量线性淡出到 0，结束后停止全部声音。
   * @param seconds 淡出时长（秒）
   * @param onDone 全部停止后的回调
   */
  fadeOutAll(seconds, onDone) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(t)
    this.master.gain.setValueAtTime(this.master.gain.value, t)
    this.master.gain.linearRampToValueAtTime(0.0001, t + seconds)
    this._fadeTimer = setTimeout(() => {
      this.stopAll()
      // 恢复总音量，供下次播放使用
      this.master.gain.value = this.masterVolume * this.masterVolume
      if (onDone) onDone()
    }, seconds * 1000)
  }

  /** 取消淡出（用户手动取消睡眠定时） */
  cancelFade() {
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer)
      this._fadeTimer = null
    }
    if (this.ctx) {
      const t = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(t)
      this.master.gain.setValueAtTime(this.master.gain.value, t)
      this.master.gain.setTargetAtTime(
        this.masterVolume * this.masterVolume, t, 0.1)
    }
  }
}

// 导出单例定义与常量，供页面使用
module.exports = SoundEngine
module.exports.SOUND_DEFS = SOUND_DEFS
