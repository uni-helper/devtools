const { uniDevtoolsWebpack } = require('@uni-helper/devtools-webpack')

module.exports = {
  chainWebpack: (config) => {
    return uniDevtoolsWebpack(config)
  },
}
