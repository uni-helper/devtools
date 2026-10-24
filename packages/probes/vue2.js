// Webpack 4 兼容性转发：vue2 子路径入口
// Webpack 4 不支持 package.json 的 exports 字段，需要实体文件
module.exports = require('./dist/agent-vue2.js')
