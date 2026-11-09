# @uni-helper/devtools-probes

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的小程序运行时探针：采集组件树、组件状态、Pinia / Vuex、页面栈、网络记录、Storage 与响应式图，通过 WebSocket 推给 node 侧，并由插件注入到被检工程里。

通常不需要直接安装：Vite / Webpack 插件会自动注入对应入口。

## 入口

| 导入路径                                  | 说明                                                |
| ----------------------------------------- | --------------------------------------------------- |
| `@uni-helper/devtools-probes/vue3`        | Vue 3 线，源码入口，由宿主构建器编译                |
| `@uni-helper/devtools-probes/vue2`        | Vue 2 线，预构建的 CJS 产物（`dist/agent-vue2.js`） |
| `@uni-helper/devtools-probes/render-hook` | 渲染期钩子，供 `script setup` 绑定还原使用          |

Webpack 4 不认识 `package.json` 的 `exports`，走包里同名的实体文件 `vue2.js` 转发。

## 约定

- 产物自包含：小程序环境没有 `node_modules`，运行时依赖全部打包进 `dist/agent-vue2.js`。
- 源码不 import `vue`，运行时由宿主注入。
- 通用 RPC 方法在 `runtime/rpc-base.ts`，Vue 2/3 各自的差异在 `vue2/` 与 `vue3/`；生命周期与单例在 `runtime/lifecycle.ts`。

## 文档

采集范围与限制见 [功能细节](https://github.com/uni-helper/devtools/blob/main/docs/FEATURES.md)，整体架构见 [架构与核心设计（白话版）](https://github.com/uni-helper/devtools/blob/main/docs/ARCHITECTURE_PLAIN.md)。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
