# Runtime Agent 与面板开发发现及问题 (PoC Findings)

## 1. packages/kit 复用取舍
- **代码库现状**：经检索 `packages/kit/src/`，当前仅包含 `addCustomTab` 与 `createTrpc` 辅助函数，并未导出组件树遍历逻辑。原项目的组件树采集实际上内联在 `packages/plugin/inspect/initMPClient.js`（`extractComponentInfo`）。
- **取舍决策**：为避免对 `packages/kit` 引入虚假依赖并消除旧 trpc 耦合，在 `src/agent/tree.ts` 中依据 Vue 3 内部实例模型（`page.$vm`、`instance.$.subTree`、`vnode.component`，并兼容 `$children`）独立实现最小树采集器。内置 4 层深度截断、单节点 `try/catch` 隔离与 `visited` 防环，确保 100% 纯 JSON 安全序列化。

## 2. 面板静态页与官方 Client 预打包
- **编解码与模块隔离**：Devframe 服务端出站响应帧包含 `s:` 前缀的 structured-clone 编码（错误帧必然带），纯手写 JSON.parse 会丢弃。且官方 client 原有相对 chunk 跨目录解析问题。
- **最终方案**：通过预打包的单文件 ESM 客户端 `src/panel/df-client.mjs`（导出 `connectDevframe`），面板采用 `<script type="module">` 引入 `panel.js`。利用 `client.scope('uni-helper-devtools')` 驱动 RPC，由官方客户端自动处理 `__connection.json` 发现、URL token 鉴权与 structured-clone 编解码；面板外层保留定时重连机制。

## 3. 遗留问题与建议
- **RPC 超时策略**：官方 `createRpcClient` 默认设置 `timeout: -1`（无限等待）。在小程序弱网/断网环境下，若未收到响应可能导致调用挂起，建议后续封装默认 10s 超时控制。
- **Relay 单播/广播**：当前探针已严格暴露 `'uni-devtools:agent:getComponentTree'` 和 `'uni-devtools:agent:ping'`，面板优先调用 node 侧 relay 方法（`uni-helper-devtools:get-component-tree`），并自动兜底 agent 原生方法。

## 4. 状态查看编辑：拉模式 vs 旧版 Watch/Push 模式差异
- **旧版推送模式**：`packages/plugin/inspect/setupProxy.js` 在客户端对所有状态递归设置深层 `watch`，产生持续跨端 push 帧，在真机/小程序受限环境中通信开销大且易引起内存抖动。
- **Spike 拉模式**：采用「面板点击节点按需 get-component-state，编辑后 update-component-state 并触发局部重新拉取」的纯拉模式。避免了运行时持续全局 watch 劫持与响应式副作用，保证通信开销严格受控且与生命周期解耦。
