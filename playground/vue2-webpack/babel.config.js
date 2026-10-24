// 关掉 useBuiltIns：@vue/app preset 默认 usage 模式会把 core-js 的 polyfill
// 按需注入产物，而 npm 解析到的 core-js@3.50 的 DOMException polyfill 在小程序
// 沙箱里会崩（无 globalThis.DOMException）：
//   TypeError: Cannot read property 'prototype' of undefined  @ vendor.js
// 小程序运行时（微信 JSCore）本身支持 ES2015+，不需要这些 polyfill。
module.exports = {
  presets: [
    ['@vue/app', { useBuiltIns: false }],
  ],
}
