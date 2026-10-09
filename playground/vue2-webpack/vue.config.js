// 使用 jiti 动态加载 ESM 模块（devtools-webpack 是 ESM）
const jiti = require('jiti')(__filename)
const { uniDevtoolsWebpack } = jiti('@uni-helper/devtools-webpack')

module.exports = {
  chainWebpack: (config) => {
    return uniDevtoolsWebpack(config)
  },
}
