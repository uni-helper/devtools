# @uni-helper/devtools-webpack

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的 Webpack 插件：面向 Vue 2 + Webpack 4 的 uni-app 工程，向小程序入口注入探针，并在 node 侧拉起 Devframe 伴生服务托管面板。

Vue 2 + Webpack 4 工程。Vue 3 + Vite 用 [@uni-helper/devtools-vite](https://www.npmjs.com/package/@uni-helper/devtools-vite)。

## 安装

```bash
pnpm add -D @uni-helper/devtools-webpack jiti
```

一般不需要单独安装：[@uni-helper/devtools](https://www.npmjs.com/package/@uni-helper/devtools) 已经带上它。

## 使用

本包只提供 ESM 产物，而 `vue.config.js` 是 CommonJS，所以用 [jiti](https://github.com/unjs/jiti) 加载：

```js
const jiti = require('jiti')(__filename)
const { uniDevtoolsWebpack } = jiti('@uni-helper/devtools-webpack')

module.exports = {
  chainWebpack: (config) => {
    return uniDevtoolsWebpack(config)
  },
}
```

函数同步返回 `chainableConfig`，伴生服务在后台异步启动。插件只在开发模式生效，生产构建不注入任何代码。

## 选项

`port`、`host`、`auth`（默认 `false`，开启后每次启动随机 token）以及对应的 `UNI_DEVTOOLS_PORT` / `UNI_DEVTOOLS_HOST` 环境变量，见 [根仓库 README 的配置一节](https://github.com/uni-helper/devtools#配置)。

## 开发提示

开发期本包优先消费探针的预构建产物 `dist/agent-vue2.js`。改过探针源码后要重新构建，否则打包进去的还是旧 bundle（控制台会给出陈旧产物告警）。

## 文档

功能列表、AI Agent 接入与已知限制见 [uni-helper/devtools 仓库](https://github.com/uni-helper/devtools#readme)。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
