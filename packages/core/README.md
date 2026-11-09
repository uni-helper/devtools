# @uni-helper/devtools-core

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的 node 侧核心：Devframe 定义（含面向 AI Agent 的工具元数据）、小程序探针的 WebSocket 中继、面板静态资源托管、Vite Inspect 托管与 Storage 收集。

通常不需要直接安装：Vite / Webpack 插件与 [@uni-helper/devtools](https://www.npmjs.com/package/@uni-helper/devtools) 依赖它。

## 对外入口

| 导入路径                                  | 内容                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `@uni-helper/devtools-core`               | `createUniDevtoolsDevframe`、`AgentRegistry`、`startUniDevtoolsServer` 等 |
| `@uni-helper/devtools-core/relay`         | 探针连接注册表 `AgentRegistry` 与 `AGENT_CLIENT_MARKER`                   |
| `@uni-helper/devtools-core/sidecar`       | 伴生服务启动、host/port 解析、本机 MCP 请求判定                           |
| `@uni-helper/devtools-core/inspect-serve` | Vite Inspect 静态托管                                                     |

自定义宿主时从 `sidecar` 起服务，再把自己的 Devframe 定义接上；面板产物在 `dist/panel`，跟随本包发布。

## 约定

- 协议类型与契约常量由 [@uni-helper/devtools-shared](https://www.npmjs.com/package/@uni-helper/devtools-shared) 提供，本包不转口。
- 探针方法名全表在 `rpc-names.ts` 组装，不放 shared：合并表会让小程序构建无法 tree-shake，破坏 Vue 2 产物的「零 Vue 3 污染」判据。

## 文档

架构与实现原理见 [架构与核心设计（白话版）](https://github.com/uni-helper/devtools/blob/main/docs/ARCHITECTURE_PLAIN.md)，面板功能见 [功能细节](https://github.com/uni-helper/devtools/blob/main/docs/FEATURES.md)。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
