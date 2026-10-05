const { uniDevtoolsWebpack } = require('@uni-helper/devtools-devframe/webpack')

module.exports = {
  chainWebpack: (config) => {
    return uniDevtoolsWebpack(config)
  },
}
