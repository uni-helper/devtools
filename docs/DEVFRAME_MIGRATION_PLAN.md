# Uni-Helper DevTools 基于 Devframe 重写方案

> **v2.0 修订版**。v1 版本经双人独立评审（对照 `devframe-docs/` 官方规范全集）发现核心技术章节与 Devframe 真实 API 严重不符、App 通信模型存在根本错误，本版依据官方文档全部重写。主要修正见[附录 A](#附录-a评审修订记录)。

## 📋 目录

- [1. 执行概要](#1-执行概要)
- [2. 为什么选择 Devframe](#2-为什么选择-devframe)
- [3. 目标架构](#3-目标架构)
- [4. 多端预留设计（App/H5）](#4-多端预留设计apph5)
- [5. 迁移策略](#5-迁移策略)
- [6. 实施路线图](#6-实施路线图)
- [7. 风险评估与缓解](#7-风险评估与缓解)
- [8. 成功标准](#8-成功标准)
- [附录 A：评审修订记录](#附录-a评审修订记录)

---

## 1. 执行概要

### 范围声明（先读）

| 范围                    | 说明                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| ✅ **本轮实现**         | 微信小程序端（现有已支持能力的对齐迁移）+ Devframe 基础设施 + 面板复用                                          |
| 🔒 **架构预留、不实现** | App（app-plus）、H5：只约束设计（见[第 4 章](#4-多端预留设计apph5)），不写适配器、不排期、不做真机联调          |
| ❌ **明确排除**         | uni-app x（uvue/uts 原生编译）；浏览器扩展、Electron 桌面应用（Devframe 官方不支持此类输出，v1 相关章节已删除） |

**预留 App 的原因**：传输层、探针接口、鉴权方式、生产剥离这四件事，现在按多端约束设计几乎没有成本，事后改造代价极高（v1 教训：`plus.bridge` 伪传输、`localhost` 地址硬编码都是事后无法修补的设计错误）。

### 项目背景

当前 uni-helper-devtools 基于自定义 trpc + Vue SPA 架构（见 `ARCHITECTURE.md`：客户端-服务器-小程序三层，Polka + ws 中转），功能可用但存在：

- **协议私有**：自定义 trpc 协议无法与其他 DevTools 工具互操作
- **重复造轮**：dev server、鉴权、面板托管等基础设施自行维护
- **生态孤立**：无法接入 Vite DevTools 等宿主
- **无 AI 接口**：AI 编码代理无法标准化访问调试能力

### 目标

基于 [Devframe](https://devfra.me/)（官方文档已完整抓取至本仓库 `devframe-docs/`，**一切 API 以该目录为准**）重写：

1. ✅ **标准契约**：RPC 基于 birpc + Standard Schema 校验，接入 Devframe 生态
2. ✅ **可集成**：可作为 Dock 插件接入 Vite DevTools（`createPluginFromDevframe`）
3. ✅ **多输出**：同一 Definition 支持 Vite 伴随运行、独立 CLI（`createCac`）、静态报告（`createBuild`）、MCP 服务（`createMcpServer`）
4. ✅ **AI 友好**：RPC 显式声明 `agent` 字段即可暴露给编码代理（MCP）
5. ✅ **多端可扩展**：本轮实现小程序端，架构不锁死 H5/App

### 关键收益

| 维度     | 当前架构                         | Devframe 架构                                         |
| -------- | -------------------------------- | ----------------------------------------------------- |
| RPC 协议 | 自定义 trpc                      | birpc + Standard Schema（Devframe 标准）              |
| 宿主集成 | 无                               | Vite DevTools Dock / 独立 dev server / CLI            |
| AI 访问  | ❌                               | ✅ MCP（`mcp: 'auto'` 自动挂载 Streamable-HTTP 路由） |
| 基础设施 | 自维护（鉴权/托管/CLI 全自己写） | 官方适配器提供                                        |
| 多端扩展 | 与小程序强耦合                   | 探针平台无关（约束见第 4 章）                         |

---

## 2. 为什么选择 Devframe

> 以下能力均已对照 `devframe-docs/specifications/SKILL.md` 与 `devframe-docs/content/` 核实。

### 2.1 真实的 Devframe 是什么

**Devframe 是 devtools 领域的 unplugin：一次定义，任意挂载。** 一个工具 = 一个 `DevframeDefinition` + 作者自带的面板 SPA。Definition 描述工具的 RPC 契约、共享状态、诊断、Web UI 和面向 Agent 的 API，与呈现/托管方式完全解耦。

两层结构：

- **Devframe（单一工具）**：`initDevframe(def, { base })` 生成运行时实例，`.handler` 是 Web Standard 的 `(request: Request) => Promise<Response>`，整个工具（SPA 静态资源、`__connection.json` 自发现、WebSocket RPC、鉴权门禁、可选 MCP 路由）收敛在一个挂载基准路径下。任何能挂 catch-all 路由的平台（Vite/Next/Nuxt/Hono/Fastify…）都能承载。
- **Hub（`@devframes/hub`）**：把多个 Devframe 组合到统一命名空间——共享 RPC 注册表、单一 WebSocket 通道、统一鉴权。Vite DevTools 就是第一个旗舰 Hub UI 提供者。

### 2.2 对本项目有价值的官方能力

| 能力               | 官方入口                                                                                                                                  | 对我们的意义                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Web Standard 挂载  | `initDevframe` from `devframe/initiate`                                                                                                   | 挂进 uni-app 的 Vite dev server                   |
| Vite 伴随运行      | `devframeVitePlugin` from `@devframes/vite/single`                                                                                        | 不装 Vite DevTools 也能用                         |
| Vite DevTools Dock | `createPluginFromDevframe` from `@vitejs/devtools-kit/node`                                                                               | 作为 Vite DevTools 的一个面板页签                 |
| RPC 契约           | `defineRpcFunction`（birpc + Standard Schema，四类：`static`/`query`/`action`/`event`）                                                   | 替代自定义 trpc，运行时参数校验                   |
| 共享状态/流        | `my.rpc.sharedState` / `my.rpc.streaming`                                                                                                 | 组件树增量更新、事件流                            |
| 静默鉴权           | `createInteractiveAuth` from `devframe/recipes/interactive-auth`，支持 `clientAuthTokens` 预共享令牌 + `?devframe_auth_token=` 连接期信任 | 小程序探针（无地址栏、无终端交互）免 OTP 静默接入 |
| CLI                | `createCac(def).parse()`，自带 `dev` / `build` / `mcp` 子命令                                                                             | 数行代码获得 CLI，v1 预留 2 周纯属浪费            |
| 静态报告           | `createBuild`（static 函数自动 dump，query 可选 `dump`）                                                                                  | 生成自包含 HTML 报告                              |
| AI/Agent           | RPC 函数声明 `agent: { description }` + `jsonSerializable: true`；`mcp: 'auto'` 自动挂 `<base>__mcp`                                      | 零额外代码暴露给编码代理                          |
| 页内通道           | `devframe/in-page-channel`（server-free，页面脚本 ↔ 面板）                                                                               | H5 场景后续可用的官方优化路径                     |

### 2.3 不存在的能力（v1 虚构，已剔除）

- ❌ `@devframe/core` / `@devframe/adapter` / `@devframe/inspector` / `@devframe/ui` / `@devframe/cli` 等包（真实：核心包为单数 `devframe`，套件为复数 `@devframes/*`）
- ❌ `buildDevframeBrowserExtension`（浏览器扩展）、`buildDevframeDesktopApp`（Electron）
- ❌ `@devframe/component-inspector` 等可复用检查器组件包（组件树采集逻辑需复用我们 `packages/kit` + `packages/plugin/src/injects` 的现有实现）
- ❌ Definition 顶层 `adapter` / `rpc` / `ui` / `cli` 平铺属性（真实：一切在 `setup(ctx)` 内注册）

---

## 3. 目标架构

### 3.1 整体拓扑（与 v1 的根本区别）

v1 把 RPC handler 写成直接运行在 uni 运行时内（`getCurrentAdapter()`），这是拓扑认知错误。**Devframe 的 `setup(ctx)` 运行在 Node 侧（dev server 进程），被调试的 uni 运行时必须作为 RPC 客户端连回来。**

```
┌────────────────────────── 开发机 ──────────────────────────┐
│                                                            │
│  ┌──────────────────┐      ┌─────────────────────────────┐ │
│  │  面板 SPA         │ WS   │  Vite dev server            │ │
│  │  (复用现有        │◄────►│  ┌───────────────────────┐  │ │
│  │   packages/client │      │  │ Devframe node 侧       │  │ │
│  │   → clientAssets) │      │  │ initDevframe(uniDef)   │  │ │
│  │  浏览器 / Vite    │      │  │                        │  │ │
│  │  DevTools Dock 渲染│     │  │ • RPC 注册表（relay）   │  │ │
│  └──────────────────┘      │  │ • 鉴权门禁              │  │ │
│                             │  │ • sharedState/流        │  │ │
│  ┌──────────────────┐ WS   │  │ • MCP 路由(自动)        │  │ │
│  │  Runtime Agent    │◄────►│  └───────────────────────┘  │ │
│  │  (注入小程序的     │      │  ▲ packages/plugin 负责:     │ │
│  │   轻量探针)        │      │  │ • 挂载 handler + ws      │ │
│  └──────────────────┘      │  │ • 虚拟模块注入地址+token  │ │
│        ▲ 运行在微信开发者    │  │ • 探针代码注入(复用injects)│ │
│        │ 工具的小程序沙箱    │  │ • 生产构建零注入          │ │
└────────┼───────────────────┴──┴────────────────────────────┘
         │ 采集: 组件树/状态/Pinia/页面栈 (复用 packages/kit)
    ┌────┴────┐
    │ uni-app │  本轮: mp-weixin   预留: H5 / App(见第4章)
    └─────────┘
```

三个角色：

1. **面板 SPA**（`packages/client` 现有 Vue SPA 复用，构建产物作为 Definition 的 `clientAssets`）——仅在开发机浏览器 / Vite DevTools Dock 中渲染，**端内不渲染任何 DevTools UI**
2. **Devframe node 侧**（新增 `packages/devframe`）——RPC 注册表充当 relay：面板调用 → node 侧转发 → 探针执行 → 结果回传
3. **Runtime Agent（探针）**——注入小程序的轻量采集端，复用现有 `packages/plugin/src/injects` 注入机制与 `packages/kit` 采集逻辑

### 3.2 Runtime Agent：本轮最核心的新组件

**为什么不能直接用 `devframe/client`**：官方客户端是浏览器模块——依赖 `__connection.json` HTTP 发现、`location`、`devframe-auth` BroadcastChannel 等，小程序沙箱内均不可用。

**方案**：探针自带一个 uni 环境可用的最小 RPC 客户端：

- **传输**：`uni.connectSocket`（唯一传输，全端一致，理由见第 4 章）
- **协议**：复用 birpc（Devframe RPC 的底层协议，纯 JSON 消息 + method/id 关联，环境无关），自己只需实现 `send` / `onMessage` 的 UniSocket 适配
- **鉴权**：连接 URL 带 `?devframe_auth_token=<dev-token>`（连接期即被信任，官方支持），token 由插件每次会话随机生成
- **发现**：跳过 `__connection.json`，插件通过虚拟模块在编译期直接注入完整的 `{ wsUrl, token }`

```ts
// packages/plugin/src/injects/agent（示意）
import { createBirpc } from 'birpc'
import { config } from 'virtual:uni-devtools-agent' // { wsUrl, token } 编译期注入

const socket = uni.connectSocket({ url: `${config.wsUrl}?devframe_auth_token=${config.token}` })

const rpc = createBirpc(
  {
    // node 侧可调用的采集函数（复用 packages/kit 现有逻辑）
    'uni-devtools:agent:getComponentTree': () => kit.getComponentTree(),
    'uni-devtools:agent:getComponentState': id => kit.getComponentState(id),
    'uni-devtools:agent:updateComponentState': ({ id, path, value }) => kit.updateState(id, path, value),
  },
  {
    post: data => socket.send({ data }),
    on: fn => socket.onMessage(e => fn(e.data)),
  },
)
```

> ⚠️ **Spike 验证项**（Phase 0）：node 侧对"特定已连接客户端"的请求-响应调用路径（birpc 双向调用机制上支持，但 Devframe node 侧的官方封装形式需实测确认；若仅开放 broadcast，则用「广播请求 + 探针回调携带 correlationId」实现 relay）。

### 3.3 Devframe 定义（真实 API）

```ts
// packages/devframe/src/index.ts
import { defineDevframe, defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import pkg from '../package.json' with { type: 'json' }

export default function createUniDevtools() {
  return defineDevframe({
    id: 'uni-helper-devtools',
    name: 'Uni DevTools',
    version: pkg.version,
    packageName: pkg.name,
    importMetaUrl: import.meta.url, // 官方要求：伴生资源解析基准
    homepage: pkg.homepage,
    description: pkg.description,
    icon: 'ph:device-mobile-duotone',
    clientAssets: '../client/dist', // 现有 Vue SPA 构建产物

    setup(ctx) {
      const uni = ctx.scope('uni-helper-devtools') // 自动命名空间 uni-helper-devtools:*

      // relay 型 RPC：面板/AI 调用 → 转发探针执行
      uni.rpc.register(defineRpcFunction({
        name: 'get-component-tree', // → uni-helper-devtools:get-component-tree
        type: 'query',
        jsonSerializable: true, // 面板 JSON 序列化；暴露给 agent API 时必需
        args: [v.object({ pageId: v.optional(v.string()) })], // 官方推荐单一对象参数
        agent: { description: 'Get the uni-app component tree of the running page. Safe to call freely.' },
        setup: () => ({
          handler: args => agentHub.call('getComponentTree', args), // agentHub 维护已连接探针
        }),
      }))

      // ... get-component-state / update-component-state（type: 'action'）
      //     get-pinia-stores / get-page-stack / get-performance-metrics 等，同模式

      // 组件树用共享状态（重连后可恢复），事件流用 streaming channel
    },
  })
}
```

### 3.4 Vite 插件职责（改造现有 `packages/plugin`）

```ts
// packages/plugin/src/index.ts（示意）
import { initDevframe } from 'devframe/initiate'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'
import { randomToken } from 'devframe/utils/crypto-token'
import uniDevtools from '@uni-helper/devtools-devframe'

export function UniDevtools() {
  return {
    name: 'uni-helper-devtools',
    configResolved(config) {
      if (config.command === 'build') {
        // 生产构建：不注入、不挂载（零残留，见 4.1 约束 5）
      }
    },
    configureServer(server) {
      // ① 每次会话随机生成 dev token（不落盘、不入库）
      const devToken = randomToken()

      // ② 静默鉴权：探针无地址栏/终端，不能走 OTP 交互；预共享 token 连接期即信任
      // 官方 createInteractiveAuth 接收 node context 构造 DevframeAuthHandler（Phase 0 spike 实测验证 context 传入时机）
      const auth = createInteractiveAuth(ctx, {
        clientAuthTokens: [devToken],
      })

      // ③ 挂载 devframe（共享 Vite 的 http server，WebSocket 绑定在 <base>__ws，零额外端口）
      const instance = initDevframe(uniDevtools(), {
        base: '/__uni-devtools/',
        server: server.httpServer ?? undefined,
        auth,
      })
      server.middlewares.use(instance.nodeMiddleware)

      // ④ 虚拟模块：地址 + token 编译期注入探针（地址机制见 4.1）
      // virtual:uni-devtools-agent → { wsUrl: resolveWsUrl(), token: devToken }
    },
    // ⑤ 探针注入：复用现有 injects 机制，仅 dev 注入
  }
}
```

### 3.5 包结构（最小改动，不做 v1 的 5 包拆分）

```
packages/
├── devframe/     # 新增：DevframeDefinition + node 侧（relay、agentHub、RPC 注册）
├── plugin/       # 改造：Vite 插件（挂载/鉴权/虚拟模块/探针注入/生产零注入）
│   └── src/injects/  # Runtime Agent 探针（含 uni 版 birpc 客户端）
├── client/       # 复用：现有 Vue SPA，构建产物 → clientAssets（不重写为 Web Components）
├── kit/          # 复用：组件树/状态采集逻辑（Agent 直接调用）
├── shared/       # 复用
└── types/        # 复用
```

理由：Devframe 官方形态是"一个工具一个包"（见 `devframe-docs/starter/`）；CLI 由 `createCac` 数行导出（挂在 devframe 包），无需独立包。

### 3.6 数据流

```
面板 SPA                    Devframe node 侧                Runtime Agent
   │  my.rpc.call('uni-helper-devtools:get-component-tree')   │
   ├────────────────────────────►│                             │
   │                             │ agentHub.call(转发)          │
   │                             ├────────────────────────────►│
   │                             │                             │ kit.getComponentTree()
   │                             │◄────────────────────────────┤
   │◄────────────────────────────┤                             │
   │                             │                             │
   │   组件树快照: sharedState（重连可恢复）                       │
   │   组件挂载/更新事件: streaming channel（增量）               │
```

---

## 4. 多端预留设计（App/H5）

> **本章是设计约束，不是实现计划。** 本轮不写任何 App/H5 适配代码、不排期、不做真机联调。目标是让后续扩展不需要推翻本轮任何组件。

### 4.1 本轮必须遵守的端无关约束

| #   | 约束                                                                                                                                                                    | 原因（事后无法修补的 v1 教训）                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **传输层唯一 WebSocket（`uni.connectSocket`）**，代码中禁止出现 `plus.bridge`/native-bridge 概念                                                                        | `plus.bridge` 是端内 JS↔原生 IPC，跨不了网络；App 真机连开发机同样走 WLAN WebSocket                                                         |
| 2   | **探针平台无关**：不 import `window`/`document`/`location`/`BroadcastChannel` 等浏览器专属 API；发现机制跳过 `__connection.json`，地址与 token 一律由虚拟模块编译期注入 | `devframe/client` 在 mp/App 沙箱不可用；探针是我们自己的代码，保持环境中立即可全端复用                                                       |
| 3   | **地址不硬编码 `localhost`**：`resolveWsUrl()` 读取顺序 `UNI_DEVTOOLS_HOST` 环境变量 → `os.networkInterfaces()` 局域网 IP → `localhost` 兜底                            | 微信开发者工具模拟器连 localhost 可通（本轮够用）；真机预览/App 真机时 localhost 指向设备自身，必须 LAN IP。地址机制现在做对，以后只是换配置 |
| 4   | **鉴权用预共享 token 静默握手**（`clientAuthTokens` + `?devframe_auth_token=`），不依赖 OTP 交互                                                                        | 真机 App 是无地址栏的静默客户端，OTP 输入不可行；token 机制全端一致                                                                          |
| 5   | **生产构建零残留**：`command === 'build'` 时不注入探针、不挂载 server；探针模块标记无副作用，保证 Rollup DCE 摇树干净                                                   | App 正式包/云打包若残留探针：体积、性能、调试端口暴露、上架审核全出问题                                                                      |
| 6   | **端内零 UI**：DevTools 面板只在开发机渲染                                                                                                                              | nvue/混合容器对 Web Components 兼容差且抢占视口（v1 的 `defineCustomElement` 端内渲染方案已废除）                                            |

### 4.2 未来扩展路径（仅记录，不承诺）

- **App（app-plus）**：探针与小程序端同一套代码；新增工作只有——真机联调文档（LAN IP 已由约束 3 支持、`adb reverse` 可选）、Android 9+ 明文流量配置指引（`manifest.json` 的 `usesCleartextTraffic`，或 wss）、HBuilderX 工作流下 vite 插件生效性验证。**无架构改动。**
- **H5**：探针可换用官方 `devframe/in-page-channel`（页面脚本 ↔ 面板，免 server 环路）作为优化路径；WS 链路保持可用作兜底。
- **uni-app x**：显式 out of scope，不在本方案任何版本承诺。
- **安全提示（真机/App 时必须评估）**：预共享 token 走 LAN 明文 `ws://` 可被嗅探，开发场景可接受；若需更强保证，官方支持 `wss://`（`ws.url` 通告机制）或自定义 `DevframeAuthHandler`。

---

## 5. 迁移策略

### 5.1 绞杀者模式（保留 v1 思路，修正执行顺序）

```
阶段 0: Spike 验证（新增，v1 缺失的最关键一步）
  用真实 Devframe 在微信开发者工具中跑通一条最小链路：
  探针 → uni.connectSocket → token 静默鉴权 → node 侧 relay → 面板显示一棵最小组件树
  验证点：§3.2 的 spike 验证项、birpc over UniSocket、虚拟模块注入
  → 验证不通过则回来修订本方案，不进入阶段 1

阶段 1: 基础设施    packages/devframe + 探针客户端 + 插件挂载/鉴权/注入
阶段 2: 组件检查器  get/update-component-tree、get/update-component-state（复用 kit 采集逻辑）
阶段 3: Pinia      stores/state/actions（时间旅行用 sharedState 快照栈实现）
阶段 4: 页面/路由   get-page-stack、navigate-to（uni API 直调）
阶段 5: 性能监控    get-performance-metrics（uni.getPerformance）
阶段 6: 多输出      CLI（createCac）/ 静态报告（createBuild）/ MCP（mcp: 'auto'，RPC 补 agent 字段）
阶段 7: 测试与文档
阶段 8: 切换清理    新版为默认 → v2.0.0-beta → 收集反馈 → v2.0.0 → 删除旧链路
```

### 5.2 并行运行与兼容

迁移期新旧并存（`vite.config.ts` 同时挂旧插件与新 Definition 的 Vite 伴随模式），用户可对比切换；功能对齐后旧入口包一层 deprecated 警告并转发到新插件（保留一个次版本），再删除。

---

## 6. 实施路线图

| Phase | 内容                                                                                 | 时长 | 验收标准                                               |
| ----- | ------------------------------------------------------------------------------------ | ---- | ------------------------------------------------------ |
| **0** | Spike：真实 Devframe + 微信开发者工具最小链路（含鉴权、relay、探针）                 | 1 周 | 面板显示最小组件树；§3.2 验证项有结论                  |
| **1** | 基础设施：`packages/devframe`、探针 birpc 客户端、插件挂载/token/虚拟模块/生产零注入 | 2 周 | 并行运行可用；生产构建产物无探针残留（产物 diff 验证） |
| **2** | 组件检查器：树查看 + 状态编辑（Options/Composition API）                             | 3 周 | 与现有功能对齐；编辑实时生效                           |
| **3** | Pinia 检查器：stores 查看/编辑/actions/时间旅行                                      | 2 周 | 时间旅行可用                                           |
| **4** | 页面栈/路由检查器 + 导航                                                             | 1 周 | 页面跳转后组件树正确更新                               |
| **5** | 性能监控：指标 + 简单 profiling                                                      | 2 周 | 实时指标可见                                           |
| **6** | 多输出：CLI / 静态报告 / MCP（RPC 标注 agent 字段）                                  | 1 周 | `uni-devtools dev/build/mcp` 三命令可用                |
| **7** | 测试（单测/集成/E2E on 微信开发者工具）+ 文档 + 迁移指南                             | 2 周 | 覆盖率 ≥ 80%（核心路径）；文档完整                     |
| **8** | Beta 发布 → 反馈迭代 → v2.0.0 → 移除旧链路                                           | 2 周 | 无严重 bug                                             |

**总计约 16 周**（含新增的 Phase 0 Spike 1 周；各 Phase 1+2+3+2+1+2+1+2+2=16 周。虽总时长同为 16 周但估算基础彻底重构：CLI 缩为 1 周、删除端内 Web Components 虚构工作、前置了关键 Spike 并充实了核心组件树对齐）。每 Phase 预留 20% 缓冲；Phase 0 结果可能调整后续估时。

---

## 7. 风险评估与缓解

### 技术风险

| 风险                                                                           | 概率/影响 | 缓解                                                                                                 |
| ------------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------- |
| **relay 调用路径与官方封装不符**（node 侧调用特定探针客户端的 API 形式未实测） | 中/高     | Phase 0 spike 首要验证项；备选方案：广播 + correlationId。已列入 §3.2                                |
| **小程序沙箱限制**：`connectSocket` 并发数、后台冻结、包体积                   | 中/中     | spike 一并实测；探针保持轻量（birpc + kit 按需加载）；降级方案：轮询                                 |
| **Devframe 版本快速演进**（项目迭代快，可能有 breaking change）                | 中/中     | 锁定版本 + 关注 `devframe-docs/content/7.migrations/` 迁移指南；核心逻辑（探针/kit）与 Devframe 解耦 |
| **@vue/devtools-kit 在小程序多页面实例下的组件树遍历**                         | 中/中     | 现有代码已解决该问题（`packages/kit`），迁移时复用而非重写                                           |

### 项目风险

| 风险                                | 概率/影响 | 缓解                                                                                                 |
| ----------------------------------- | --------- | ---------------------------------------------------------------------------------------------------- |
| 时间超期                            | 中/高     | MVP 优先（组件检查器是核心）；Phase 0 后重估；性能/时间旅行可降级到 v2.1                             |
| 破坏现有用户                        | 低/高     | 并行运行 + deprecated 兼容层 + 回滚计划                                                              |
| HBuilderX 工作流差异（非 CLI 工程） | 中/中     | 本轮只支持 CLI 工程（`uni` / vite 直接启动）；HBuilderX 验证列入 App/H5 扩展时（§4.2），文档明确说明 |

> v1 把"Devframe 文档不足"列为最高风险——事实相反，官方文档完备且已本地化（24 篇指南 + 8 篇适配器文档 + 99 项错误码）。真正的风险是**不读文档按想象写方案**，v1 本身就是例证。

---

## 8. 成功标准

### 功能完整性

- ✅ 组件检查器：树查看/过滤/搜索、状态查看与编辑（Options + Composition API）
- ✅ Pinia：stores 查看/编辑、actions 调用、时间旅行
- ✅ 页面栈/路由查看与导航跳转
- ✅ 性能指标查看与基础 profiling
- ✅ CLI（dev/build/mcp）、静态 HTML 报告、MCP agent 接口

### 架构质量（多端预留验收）

- ✅ 探针代码零浏览器专属 API（lint 规则强制：禁止 import `window`/`document` 等）
- ✅ 传输层仅 `uni.connectSocket`，代码库中无 native-bridge 概念
- ✅ 地址/token 全部编译期虚拟模块注入，无硬编码
- ✅ 生产构建产物零探针残留（构建产物 diff 验证进 CI）
- ✅ 面板 SPA 复用现有 `packages/client`（不重写）

### 质量

- ✅ 测试覆盖率 ≥ 80%（核心路径）；微信开发者工具 E2E 通过
- ✅ RPC 调用延迟 < 100ms；面板操作响应 < 200ms
- ✅ 鉴权：无 token 连接被拒（DF0036），有 token 静默通过

---

## 附录 A：评审修订记录

v1（commit 68b83eb）经双人独立评审判定"不建议执行"，本版为重写。主要修正：

| #   | v1 问题                                                                                | v2 修正                                                                                                      |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | 虚构包名 `@devframe/*` 系列、顶层 `adapter/rpc/ui/cli` 定义结构、`subscription<T>` API | 全部替换为官方真实 API（`devframe`、`defineRpcFunction`、`ctx.scope().rpc.register`、streaming/sharedState） |
| 2   | 虚构浏览器扩展/Electron 输出形态                                                       | 删除；输出形态收敛为官方部署矩阵（CLI/静态报告/MCP/embedded/Vite）                                           |
| 3   | 拓扑错误：RPC handler 直接跑在 uni 运行时                                              | 修正为三角色拓扑（面板 SPA ↔ node 侧 relay ↔ Runtime Agent），Agent 客户端为本方案核心新组件               |
| 4   | `plus.bridge` 作 App 传输（根本性错误）                                                | 传输层唯一 WebSocket；App 仅保留设计约束（§4），不做实现                                                     |
| 5   | OTP 鉴权将阻断无界面客户端（v1 完全未考虑鉴权）                                        | `createInteractiveAuth` + `clientAuthTokens` 静默握手                                                        |
| 6   | 硬编码 `ws://localhost:5173`、生产 fallback 远端服务器                                 | 虚拟模块编译期注入，地址解析顺序环境变量 → LAN IP → localhost；删除远端 fallback                             |
| 7   | 正式包无剥离设计                                                                       | 生产零注入 + DCE，进 CI 验收                                                                                 |
| 8   | 面板计划重写为 Web Components 并在端内渲染                                             | 复用现有 Vue SPA（`clientAssets`），仅开发机渲染                                                             |
| 9   | 虚构 5 包 monorepo 拆分、误记现有包名                                                  | 最小改动：新增 `devframe` 包，改造 `plugin`，复用 `client/kit/shared/types`                                  |
| 10  | 16 周路线图估时失真（CLI 注水、真机/App 风险未排）                                     | 新增 Phase 0 spike；重排估时（约 15 周）；风险矩阵重写                                                       |
| 11  | "Devframe 文档不足"列为最高风险                                                        | 更正：文档完备且已本地抓取（`devframe-docs/`）；真实风险见第 7 章                                            |

**评审依据**：`devframe-docs/specifications/SKILL.md`、`devframe-docs/content/1.guide/14.security.md`、`devframe-docs/content/8.references/10.interactive-auth.md`、`devframe-docs/content/2.adapters/1.initiate.md` 等。

---

**文档版本**：2.0.0
**最后更新**：2026-09-30
**维护者**：Uni-Helper Team
