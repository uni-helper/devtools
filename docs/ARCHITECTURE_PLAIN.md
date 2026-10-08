# Uni-Helper DevTools 架构与核心设计（白话版）

> 本文面向所有需要了解本项目架构与设计细节的开发者。不搞黑话堆砌，讲清楚三件事：**数据链路如何流转**、**核心适配层（1108 行）承担了什么**、**如何与官方 `@vue/devtools-kit` 优雅解耦与集成**。

---

## 一、系统架构：四层链路

现在的实际链路分为四层：

```
[ 小程序运行时 ]
      │  (小程序探针 agent：拦截路由/Pinia/组件树/网络，吐出私有 RPC)
      ▼  WebSocket
[ 本地 Node 进程 ]
      │  (Node relay：基于 devframe，纯哑管道转发 + ping 兜底，不碰任何 kit 协议)
      ▼  Devframe WebSocket
[ 浏览器 Panel 适配器 ]
      │  (uni-devtools-rpc.ts：1108 行核心资产，把探针私有协议翻译成 kit 领域契约)
      ▼  DevtoolsRpcClient 接口 (query / command / onEvent)
[ 官方 UI 面板 ]
      │  (直接移植自 Vue 官方 DevTools 的 SPA，几乎零修改)
```

### 各层的实际职责：

1. **小程序探针（Agent）**：打包时自动注入小程序，直接访问运行时的 Vue 实例、Pinia store、页面栈和网络 API。它暴露的是一套自研定义的 RPC 方法（如 `uni-devtools:agent:getComponentTree`）。
2. **Node 中继（Relay）**：跑在 Vite/Sidecar 进程里，维护 WebSocket 连接。它**只负责管道转发，不包含任何 kit 协议**。
3. **协议适配器（Adapter，1108 行）**：跑在前端面板里（[uni-devtools-rpc.ts](file:///Users/mac/Documents/workspace/DBAA/devtools/packages/panel/src/adapter/uni-devtools-rpc.ts)）。它向上模拟出一个符合官方 kit 规范的 `DevtoolsRpcClient`，向下调用 Node 暴露的 devframe RPC。**整个项目最核心的领域语义转换全在这里**。
4. **官方 UI 面板（Panel SPA）**：从官方 Vue DevTools 仓库完整移植的前端界面。它以为自己连着标准的 Vue 页面，底层由适配器完成数据契约桥接。

---

## 二、为什么需要核心适配层（1108 行）？

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

这 1108 行适配器（[uni-devtools-rpc.ts](file:///Users/mac/Documents/workspace/DBAA/devtools/packages/panel/src/adapter/uni-devtools-rpc.ts)）是本项目的核心资产，完整覆盖了小程序与官方 UI 之间复杂的协议映射。

---

## 三、与官方 @vue/devtools-kit 的集成与解耦

本项目面板直接依赖 npm 官方发布的 `@vue/devtools-kit@9.0.0-beta.0`，不再在仓库内维护源码快照（vendoring），实现了清晰的解耦：

1. **直接注入适配客户端，无需自定义 Host**：
   官方 kit 提供了 `connectDevtoolsClient` 供 Extension / iframe 自动发现信道。但我们的面板在 [devtools-connection.ts](file:///Users/mac/Documents/workspace/DBAA/devtools/packages/panel/src/composables/devtools-connection.ts#L42) 中直接调用自研的 `connectUniRpcClient()`，直接将实现好的适配器塞给前端状态机，无需多封装一层自定义 Host，完全解耦了传输层机制。
2. **极轻的运行时消费面**：
   整个 Panel 在运行时仅依赖官方 kit 根导出的 3 个工具函数（`encodeValue`、`formatEditText`、`parseEditText`），用于对复杂对象进行安全编解码与编辑回写。其他对 kit 的引用均为纯 TypeScript 编译期类型（`import type`）。
3. **npm 版全量兼容**：
   经自动化枚举比对，npm 发布版导出面与官方源码快照 204 个符号完全重合，面板引用的 31 个协议类型与工具函数在 npm 包中完整保留，不存在版本漂移风险。

---

## 四、两处自改分歧的无侵入实现方案

在切为 npm 官方包后，本项目原本两处必要的定制改动采用了**无侵入本地化方案**实现，避免维护额外的 `pnpm patch` 补丁文件：

| 定制点                 | 诉求与性质                                                                                             | 无侵入落地方式                                                                                                                                                                                                                    | 对应文件                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Vite Inspect 门控**  | 官方 `DevtoolsCapabilitiesMessage` 缺少可选的 `inspect?: boolean` 字段（纯类型声明）。                 | 通过 TypeScript 模块声明合并（Declaration Merging）向 `@vue/devtools-kit` 扩展字段，零运行时开销。                                                                                                                                | [types/devtools-kit.d.ts](file:///Users/mac/Documents/workspace/DBAA/devtools/packages/panel/src/types/devtools-kit.d.ts) |
| **响应式图谱版本门禁** | 官方 kit 将响应式图谱门槛硬编码为 Vue 3.6.0，而小程序内置 Vue 多为 3.5.x（3.5 已支持响应式双向链表）。 | 在面板本地实现行为等价的 `supportsReactivityGraphVueVersion`（门限放宽至 3.5.0），并在 [devtools-client.ts](file:///Users/mac/Documents/workspace/DBAA/devtools/packages/panel/src/composables/devtools-client.ts#L13) 切换引用。 | [utils/vue-version.ts](file:///Users/mac/Documents/workspace/DBAA/devtools/packages/panel/src/utils/vue-version.ts)       |

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
