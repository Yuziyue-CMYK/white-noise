/**
 * 主题工具（utils/theme.js）
 * ------------------------------------------------------------
 * 深浅双主题：颜色变量定义在 app.wxss（.theme-dark / .theme-light），
 * 本模块负责读取/切换/持久化主题，并同步 tabBar 与导航栏颜色。
 */

const COLORS = {
  dark: {
    navBg: '#0f1420',
    navFront: '#ffffff',
    tabBg: '#141a2a',
    tabColor: '#8a93a6',
    tabSelected: '#7ee0c3',
    accent: '#7ee0c3'   // slider 等无法使用 CSS 变量的组件用它
  },
  light: {
    navBg: '#f5f7fa',
    navFront: '#000000',
    tabBg: '#ffffff',
    tabColor: '#8a93a6',
    tabSelected: '#0d9c77',
    accent: '#0d9c77'
  }
}

/** 读取当前主题（默认深色） */
function get() {
  return wx.getStorageSync('theme') || 'dark'
}

/** 应用主题到全局可编程组件（tabBar / 导航栏），并持久化 */
function apply(theme) {
  wx.setStorageSync('theme', theme)
  const c = COLORS[theme]
  try {
    wx.setTabBarStyle({
      backgroundColor: c.tabBg,
      color: c.tabColor,
      selectedColor: c.tabSelected,
      borderStyle: theme === 'dark' ? 'black' : 'white'
    })
  } catch (e) { /* 非 tabBar 页面调用会失败，忽略 */ }
  try {
    wx.setNavigationBarColor({
      frontColor: c.navFront,
      backgroundColor: c.navBg
    })
  } catch (e) { /* 忽略 */ }
  return theme
}

/** 切换主题 */
function toggle() {
  return apply(get() === 'dark' ? 'light' : 'dark')
}

/** 页面 onShow 时调用：返回主题名并同步导航栏 */
function sync() {
  const t = get()
  const c = COLORS[t]
  try {
    wx.setNavigationBarColor({
      frontColor: c.navFront,
      backgroundColor: c.navBg
    })
  } catch (e) { /* 忽略 */ }
  return t
}

module.exports = { get, apply, toggle, sync, COLORS }
