# Uni-Helper DevTools 架构与核心设计（白话版）

> 本文面向所有需要了解本项目架构与设计细节的开发者。不搞黑话堆砌，讲清楚三件事：**数据链路如何流转**、**核心适配层承担了什么**、**如何与官方 `@vue/devtools-kit` 优雅解耦与集成**。

---

## 一、系统架构：四层链路

现在的实际链路分为四层：

```
[ 小程序运行时 ]
      │  (小程序探针 agent：拦截路由/Pinia/组件树/网络，吐出私有 RPC)
      ▼  WebSocket
[ 本地 Node 进程 ]
      │  (Node relay：基于 devframe，只认最新连上的探针，转发调用 + 缓存推送，不碰任何 kit 协议)
      ▼  Devframe WebSocket
[ 浏览器 Panel 适配器 ]
      │  (uni-devtools-rpc.ts：核心资产，把探针私有协议翻译成 kit 领域契约)
      ▼  DevtoolsRpcClient 接口 (query / command / onEvent)
[ 官方 UI 面板 ]
      │  (直接移植自 Vue 官方 DevTools 的 SPA，几乎零修改)
```

### 各层的实际职责：

1. **小程序探针（Agent）**：打包时自动注入小程序，直接访问运行时的 Vue 实例、Pinia store、页面栈和网络 API。它暴露的是一套自研定义的 RPC 方法（如 `uni-devtools:agent:getComponentTree`）。
2. **Node 中继（Relay）**：跑在 Vite/Sidecar 进程里，维护 WebSocket 连接。它**不包含任何 kit 协议**，职责只有三件：把面板 / Agent 的调用转发给探针；把探针推送的组件树、网络记录存进 sharedState；**同一时刻只认一个探针（最新连上的那个）**——多台设备同时在线时，其余设备的推送被丢弃，活跃设备断开后回落到次新设备，并主动从它重新拉取数据。
3. **协议适配器（Adapter）**：跑在前端面板里（[uni-devtools-rpc.ts](../packages/adapter/src/uni-devtools-rpc.ts)）。它向上模拟出一个符合官方 kit 规范的 `DevtoolsRpcClient`，向下调用 Node 暴露的 devframe RPC。**整个项目最核心的领域语义转换全在这里**。
4. **官方 UI 面板（Panel SPA）**：从官方 Vue DevTools 仓库完整移植的前端界面。它以为自己连着标准的 Vue 页面，底层由适配器完成数据契约桥接。

---

## 二、为什么需要核心适配层？

容易产生的一个直觉误区是：“小程序探针收集好数据，Node 端打个包转一下，前端面板应该就能直接渲染”。

但实际上，官方 `@vue/devtools-kit` 并没有定义所谓通用的“探针数据格式”，它定义的是官方 UI 视角的**领域交互契约与双向状态机**（`query` / `command` / `onEvent`）。小程序与标准 Web Vue 运行时之间存在明显的领域模型差异，不能只靠简单的字段重命名，必须由适配层进行深层语义翻译：

1. **多页面映射为多 App（AppSnapshot）**：
   小程序拥有独特的页面栈与分包机制，与 Web 单应用形态截然不同。适配器将每个 uni-app 页面映射为一个独立的 `AppSnapshot`（复用官方 UI 顶部的多 App 下拉切换），组件 ID 统一采用 `route#uid` 定位，天然实现多页面隔离。
2. **递归嵌套树展开为扁平快照**：
   探针采集到的是带 `children` 的递归树，而官方 client 期望的是无 children 字段、通过 `parentId` 建立拓扑关联的扁平 `ComponentTreeNodeSnapshot[]`。适配器需要对组件树做降维展开并注入更新时间戳。
3. **按组件维度的版本号防陈旧机制**：
   官方 client 依赖单调递增的 `version` 判定快照新旧以避免陈旧循环。适配器对状态更新（`stateInvalidated`）必须以**组件**为维度独立计数维护版本；若简单采用全局计数器，并发编辑不同组件时旧快照会覆盖新版本号导致状态错乱。
4. **苛刻的事件过滤契约**：
   官方 client 的事件订阅非常严格，例如收到组件树增量更新（`components:treePatched`）时，**必须携带 `appId` 且必须与当前选中的页面严格一致**，否则官方 client 内部事件处理器会直接静默丢弃（控制台不报错，但界面完全停止更新）。

这个适配器（[uni-devtools-rpc.ts](../packages/adapter/src/uni-devtools-rpc.ts)）是本项目的核心资产，完整覆盖了小程序与官方 UI 之间复杂的协议映射。

---

## 三、与官方 @vue/devtools-kit 的集成与解耦

本项目面板直接依赖 npm 官方发布的 `@vue/devtools-kit@9.0.0-beta.0`，不再在仓库内维护源码快照（vendoring），实现了清晰的解耦：

1. **直接注入适配客户端，无需自定义 Host**：
   官方 kit 提供了 `connectDevtoolsClient` 供 Extension / iframe 自动发现信道。但我们的面板在 [devtools-connection.ts](../packages/client/src/composables/devtools-connection.ts) 中直接调用自研的 `connectUniRpcClient()`，直接将实现好的适配器塞给前端状态机，无需多封装一层自定义 Host，完全解耦了传输层机制。
2. **极轻的运行时消费面**：
   整个 Panel 在运行时仅依赖官方 kit 根导出的 3 个工具函数（`encodeValue`、`formatEditText`、`parseEditText`），用于对复杂对象进行安全编解码与编辑回写。其他对 kit 的引用均为纯 TypeScript 编译期类型（`import type`）。
3. **npm 版全量兼容**：
   经自动化枚举比对，npm 发布版导出面与官方源码快照 204 个符号完全重合，面板引用的 31 个协议类型与工具函数在 npm 包中完整保留，不存在版本漂移风险。

---

## 四、两处自改分歧的无侵入实现方案

在切为 npm 官方包后，本项目原本两处必要的定制改动采用了**无侵入本地化方案**实现，避免维护额外的 `pnpm patch` 补丁文件：

| 定制点                 | 诉求与性质                                                                                             | 无侵入落地方式                                                                                                                                                                | 对应文件                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Vite Inspect 门控**  | 官方 `DevtoolsCapabilitiesMessage` 缺少可选的 `inspect?: boolean` 字段（纯类型声明）。                 | 通过 TypeScript 模块声明合并（Declaration Merging）向 `@vue/devtools-kit` 扩展字段，零运行时开销。                                                                            | [types/devtools-kit.d.ts](../packages/client/src/types/devtools-kit.d.ts) |
| **响应式图谱版本门禁** | 官方 kit 将响应式图谱门槛硬编码为 Vue 3.6.0，而小程序内置 Vue 多为 3.5.x（3.5 已支持响应式双向链表）。 | 在面板本地实现行为等价的 `supportsReactivityGraphVueVersion`（门限放宽至 3.5.0），并在 [devtools-client.ts](../packages/client/src/composables/devtools-client.ts) 切换引用。 | [utils/vue-version.ts](../packages/client/src/utils/vue-version.ts)       |

### 验证指标

- **`typecheck`**：✅ 全绿（0 错误）。顺带通过在 `devtools-kit.d.ts` 补充 `RuntimeCommandMap` 扩展，规范修掉了既有的 `components:openInEditor` 类型错误。
- **`vite build`**：✅ 顺利打包，产物中仅包含放宽后的 `[3, 5, 0]` 门禁逻辑。
- **`e2e-node.mjs`**：✅ 端到端测试全绿。

---

## 五、注意事项与排查指南

在后续迭代或维护中，以下几点需要特别关注：

| 潜在风险             | 故障表现                                                                    | 排查方向                                                                            |
| -------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **本地门禁判断失效** | 响应式图谱（Reactivity Graph）Tab **静默消失**，控制台无任何报错。          | 检查面板本地的版本判断逻辑是否依然对 3.5.x 放行。                                   |
| **协议版本漂移**     | 若无脑升级 npm kit 版本，底层字段协议若有变更，组件树可能出现空挂载或白屏。 | 必须锁定 npm kit 的 exact 版本（如 `9.0.0-beta.0`），不要使用 `^` 或 `~` 浮动版本。 |
| **事件过滤失效**     | 官方 UI 收到组件树补丁但界面停止响应。                                      | 检查适配器发出的 `treePatched` 事件中附带的 `appId` 是否严格匹配当前活动页面路由。  |

---

## 附：总览图与分层（原 README「系统架构」）

Uni DevTools 采用**双消费者（人类开发者 UI + AI Coding Agent）**的现代化解耦架构：

```text
                          ┌─────────────────────────────┐
                          │   构建工具 (Vite / Webpack)  │
                          │   - 编译期 AST 插桩注入      │
                          │   - 注入 __file / 闭包 / 探针 │
                          └──────────────┬──────────────┘
                                         │ 编译注入
                                         ▼
                          ┌─────────────────────────────┐
                          │   小程序运行时探针 (Probe)   │
                          │  - 沙箱运行时 (Vue 2 / Vue 3) │
                          │  - 组件树 / 状态 / 路由 / 网络  │
                          └──────────────┬──────────────┘
                                         │ WebSocket
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           本地 Node 进程 (Devframe Sidecar)                       │
│                                                                                 │
│  ┌─────────────────────────┐          ┌──────────────────────────────────────┐  │
│  │   AgentRegistry Relay   │ ◄──────► │     Devframe 核心定义 (@uni-helper/    │  │
│  │     (WebSocket 中继)    │          │      devtools-core)                  │  │
│  └─────────────────────────┘          │  - 21 个 agent 工具（描述+参数 schema）│  │
│                                       │  - Vite Inspect 静态托管             │  │
│                                       └──────────────────┬───────────────────┘  │
└───────────────────────┬──────────────────────────────────┼──────────────────────┘
                        │ Devframe WS RPC                  │ MCP Protocol
                        ▼                                  ▼
      ┌───────────────────────────────────┐    ┌──────────────────────────────────┐
      │        浏览器端 (Human Dev)       │    │      外部 AI Agent (AI Coding)   │
      │                                   │    │                                  │
      │  ┌─────────────────────────────┐  │    │  Cursor / Claude / Windsurf /    │
      │  │  协议适配层 (Adapter)        │  │    │  Antigravity 等                  │
      │  │  - Devframe RPC ➔ Kit 翻译   │  │    │                                  │
      │  └──────────────┬──────────────┘  │    │  - 自动化读取组件树 / 状态 / 路由 │
      │                 │ DevtoolsRpcClient    │  - 分析请求时序与网络异常        │
      │  ┌──────────────▼──────────────┐  │    │  (由 @uni-helper/devtools-mcp    │
      │  │  官方 UI 面板 (Client SPA)   │  │    │   自动暴露 stdio / fetch 端点)   │
      │  │  (Vue DevTools v9 Client)   │  │    └──────────────────────────────────┘
      │  └─────────────────────────────┘  │
      └───────────────────────────────────┘
```

### 核心分层与数据流转

1. **编译期 AST 插桩（Vite / Webpack）**：
   在打包阶段自动注入运行时探针，并为组件补齐编译期丢失的关键元信息（如 SFC 源码路径 `__file`、Setup 闭包变量捕获及 Render 钩子包装）。
2. **小程序沙箱探针（Probe，运行在小程序逻辑层）**：
   轻量级沙箱采集器，适配 Vue 3 与 Vue 2 运行时，拦截组件树、Pinia / Vuex 状态、路由栈与网络请求，通过标准 WebSocket 与本地 Node 端双向通信。
3. **Node 核心中继与服务（Core / Devframe Sidecar）**：
   - **AgentRegistry Relay**：管理探针 WebSocket 连接。**同一时刻只认一个探针——最新连上的那个**：模拟器与真机（或多台真机）同时在线时，读写都只落到最后连上的设备，其余设备的推送被丢弃；它断开后回落到仍在线的次新设备，并主动从新设备重新拉取组件树与网络记录。
   - **Devframe RPC**：20 个面板 / Agent 可调的公开 RPC 外加 `ping` 健康检查（MCP 工具列表里还有 devframe 自带的 `devframe_state_read`，共 22 个），均带 Agent 描述、参数 schema（运行时校验 + MCP 的 JSON Schema）与读写安全标注；另有 4 个探针 → node 的内部推送入口，不暴露给 MCP。同时托管 Vite Inspect 静态报告与面板资产。
4. **双路消费者架构（Dual Consumers）**：
   - **人类开发者（浏览器 UI）**：**协议适配层（Adapter）与 UI 面板（Client）均运行在浏览器端**。Adapter 负责将 Devframe RPC 翻译为 `@vue/devtools-kit` 的领域契约（扁平树拓扑、多 App 映射、版本去陈旧），无缝驱动官方 Vue DevTools v9 SPA。
   - **AI Coding Agent（MCP 端点）**：通过 `@uni-helper/devtools-mcp` 将 Core RPC 暴露为标准的 Model Context Protocol (MCP) 接口，供外部 AI 编程助手直接获取小程序运行期上下文。
