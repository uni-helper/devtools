# Uni DevTools

<p align="center">
  <b>为 uni-app（尤其是小程序场景）打造的现代化 DevTools</b><br>
  将官方 Vue DevTools v9 的原生体验与强大能力带入跨端生态。
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/Vue-2%20%7C%203-brightgreen.svg" alt="Vue 2 & 3">
  <img src="https://img.shields.io/badge/uni--app-Vite%20%7C%20Webpack-orange.svg" alt="uni-app Vite & Webpack">
  <img src="https://img.shields.io/badge/MCP-Supported-purple.svg" alt="Model Context Protocol">
</p>

<p align="center">
  <img src=".github/assets/demo.png" alt="Uni DevTools Preview" />
</p>

---

## 快速上手

### 1. 安装依赖

在你的 uni-app 项目根目录安装开发依赖：

```bash
# 推荐：安装聚合门面包
pnpm add -D @uni-helper/devtools

# 也可按需安装专用插件包：
# pnpm add -D @uni-helper/devtools-vite     # 仅 Vite (Vue 3)
# pnpm add -D @uni-helper/devtools-webpack  # 仅 Webpack (Vue 2)
```

---

### 2. 接入构建工具

#### 选项 A：Vue 3 + Vite 工程（推荐）

在 `vite.config.ts` 中引入并注册 `UniDevtoolsPlugin`（建议置于 `Uni()` 之前）：

```ts
import { defineConfig } from 'vite'
import Uni from '@dcloudio/vite-plugin-uni'
import { UniDevtoolsPlugin } from '@uni-helper/devtools'

export default defineConfig({
  plugins: [
    UniDevtoolsPlugin(),
    Uni(),
  ],
})
```

#### 选项 B：Vue 2 + Webpack 4 工程

在 `vue.config.js` 中通过 `chainWebpack` 挂载插件：

```js
const jiti = require('jiti')(__filename)
const { uniDevtoolsWebpack } = jiti('@uni-helper/devtools')

module.exports = {
  chainWebpack: (config) => {
    return uniDevtoolsWebpack(config)
  },
}
```

---

### 3. 运行与调试

以微信小程序为例，启动开发环境：

```bash
# Vite 工程
pnpm dev:mp-weixin

# Webpack 工程
pnpm serve:mp-weixin
```

编译启动后，控制台将输出专属的 DevTools 访问链接（已附带临时安全鉴权 Token）：

```text
➜  Uni DevTools: http://localhost:9999/__uni-devtools/?devframe_auth_token=xxxxxx
```

在现代浏览器中打开该链接即可开始调试。

---

### 4. AI Agent / MCP 支持（可选）

Uni DevTools 内置对 Model Context Protocol (MCP) 的原生支持。AI Coding Agent（Cursor、Claude Desktop、Windsurf、Antigravity 等）可直接消费运行期数据：

```bash
# 启动 stdio 模式的 MCP 适配服务
npx @uni-helper/devtools mcp
```

Agent 可直接调用组件树、Pinia / Vuex 状态、网络抓包及路由堆栈等 RPC 进行自动化故障诊断与代码分析。

---

## 核心特性

Uni DevTools 解决了 uni-app 小程序开发中编译后信息丢失、闭包变量不可见以及调试工具生态割裂的核心痛点：

### 组件树与状态检视（Components & State）

- **多页面映射为多 App 快照**：小程序页面栈（`getCurrentPages()`）和分包体系在运行时天然映射为独立的 App 实例快照，组件节点通过 `route#uid` 隔离，与官方 Client 顶部应用切换完全对齐。
- **编译期 AST 插桩还原文件名**：Vite / Webpack 插件在编译期拦截 `uniComponent://` 与 `uniPage://` 虚拟入口，注入 `__file` 属性，精准还原 SFC 源文件路径，消除编译后模板中的 `<Anonymous>`。
- **穿透闭包状态检视**：针对 Vue 3 `<script setup>` 编译器直接内联返回 render 函数导致局部变量不可见的问题，构建期通过 AST 插桩向返回函数挂载 `__uni_devtools_bindings__`，运行时安全读取闭包内的 ref / reactive 活值。
- **官方规范状态分组与徽标**：严格对齐官方 `props` / `data` / `setup` / `computed` / `attrs` 分组，附带 `(Ref)`、`(Reactive)`、`(Computed)` 徽标，并提供 computed 原始定义与求值 tooltip。
- **渲染钩子防抖推送**：编译期包装组件 render 钩子（`__uniDevtoolsNotifyRender`），组件更新时在约 300ms 内防抖推送到 Node 侧 `sharedState`，并内置快照哈希内容比对门控，避免动画或倒计时触发推送风暴。
- **深路径状态编辑与删除**：支持顶层变量、深层嵌套对象路径（`path: string[]`）、数组下标的实时修改与属性删除（`deleteReactive`），修改后自动触发失效事件驱动 UI 刷新。
- **查看渲染函数源码（Show Render Code）**：从已注册组件实例中提取 render 函数源码，自动解开插桩包装层，并按主体公共缩进归一化后展示。
- **源码一键直达（Open in Editor）**：从组件树或状态面板一键在本地编辑器打开对应源码文件，基于 Node 端 `launch-editor` 实现，并内置项目根目录越界安全守卫。

### 状态管理检视器（Pinia & Vuex Inspector）

- **Pinia（Vue 3）运行时自动探测**：直接从应用根实例（`$pinia` / `_s`）枚举 Stores，无需在用户业务代码中手动挂载代理插件；完整支持 Options Store 与 Setup Store；还原官方 `Pinia (root)` 聚合看板与各 Store 平级视图，支持深层 State 双向编辑与修改回写。
- **Vuex（Vue 2）多级降级探测**：针对 Vue 2 + Webpack 4 工程，采用三级降级策略（`getApp().$vm.$store` / `getApp().$store` / `Vue.prototype.$store`）可靠定位 Store 实例；支持 Root 及命名空间模块的 State / Getters 检视，并支持 State 深层路径编辑同步。

<p align="center">
  <img src=".github/assets/pinia.png" alt="Pinia Inspector Preview" />
</p>

### 路由与页面栈（Pages & Navigation）

- **注册路由自动解析**：自动解析项目 `pages.json`（支持注释、尾随逗号及 `subPackages` 分包配置）。
- **动态页面栈监控**：动态展示当前小程序页面栈（`getCurrentPages()`）深度与路由参数。
- **面板交互导航与防叠栈**：支持在 DevTools 中触发 `navigateTo`、`redirectTo` 与 `switchTab`；内置“同页导航自动改用 redirect”策略，避免面板反复导航耗尽小程序 10 层页面栈上限。

<p align="center">
  <img src=".github/assets/pages.png" alt="Pages & Navigation Preview" />
</p>

### 响应式依赖图谱（Reactivity Graph）

- **Vue 3.5+ 链表追踪**：沿 Vue 3.5+ 响应式双向链表（`deps`/`nextDep`、`subs`/`nextSub`）递归遍历，采集 Setup 响应式源与 Render / Watcher 间的拓扑关系。
- **力导向拓扑呈现**：基于 d3-force 力导向图直观呈现响应式依赖关系。
- **版本门禁放宽与引导**：官方 3.6.0 门槛针对小程序生态放宽至 Vue 3.5.0；低于 3.5 时在面板中提供明确升级指引。

### 网络请求看板（Network Inspector）

- **单点代理全链路捕获**：深度拦截 `uni.request`、`uni.uploadFile`、`uni.downloadFile`，不碰底层 `wx.*` 以避免重复计数；透明透传原回调与 Promise 语义。
- **环形缓冲与增量同步**：探针端维护最多 500 条记录的环形缓冲区，单条报文进行 64KB 截断保护，500ms 防抖增量合并推送到 Node 侧。
- **瀑布图与报文抽屉**：按时序呈现请求流与精准瀑布耗时条形图，动态展示在途 pending 状态；抽屉支持查看 Headers、Query、Request Body、Response Body 及性能耗时指标。
- **AI Agent 诊断接口**：通过 `get-network-records`、`clear-network-records` 等 RPC，让外部 AI 助手直接获取网络调用诊断上下文。

### 构建管线检查（Vite Inspect）

- **转换流程与中间代码产物检查**：Node Sidecar 托管 `vite-plugin-inspect` 的构建产物，在 DevTools 独立标签页中通过 iframe 查看 Vite 插件管道的转换流程、耗时热点与中间代码。

---

## 使用须知与环境配置

### 1. 小程序开发者工具设置

在微信开发者工具等 IDE 中进行本地调试时，请确保满足以下配置：

1. **开启服务端口**：微信开发者工具菜单栏 -> `设置` -> `安全设置` -> 开启 `服务端口`。
2. **放行本地请求**：在项目详情中勾选 `不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书`（以便小程序与本地 DevTools WebSocket 通信）。

### 2. 本地编辑器直达配置（Open in Editor）

从面板点击源码文件直接唤起本地编辑器时：

- **VS Code 用户（推荐）**：
  1. 在 VS Code 中按下 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows/Linux）。
  2. 执行 `Shell Command: Install 'code' command in PATH`。
- **其他编辑器（Cursor、WebStorm、Sublime 等）**：
  在项目根目录的 `.env` 或系统环境变量中配置对应编辑器的启动命令：
  ```bash
  # Cursor
  export LAUNCH_EDITOR=cursor

  # WebStorm
  export LAUNCH_EDITOR=webstorm

  # Sublime Text
  export LAUNCH_EDITOR=subl
  ```

---

## 系统架构

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
│  └─────────────────────────┘          │  - 19 个核心 RPC (带 agent 元数据)     │  │
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
   - **AgentRegistry Relay**：管理探针 WebSocket 连接，负责安全定向调用与状态同步。
   - **Devframe RPC**：注册 19 个核心 RPC（均携带严格的 Zod Schema 与 Agent 描述元数据），同时托管 Vite Inspect 静态报告与面板资产。
4. **双路消费者架构（Dual Consumers）**：
   - **人类开发者（浏览器 UI）**：**协议适配层（Adapter）与 UI 面板（Client）均运行在浏览器端**。Adapter 负责将 Devframe RPC 翻译为 `@vue/devtools-kit` 的领域契约（扁平树拓扑、多 App 映射、版本去陈旧），无缝驱动官方 Vue DevTools v9 SPA。
   - **AI Coding Agent（MCP 端点）**：通过 `@uni-helper/devtools-mcp` 将 Core RPC 暴露为标准的 Model Context Protocol (MCP) 接口，供外部 AI 编程助手直接获取小程序运行期上下文。

> 深入的设计决策与协议映射逻辑，请查阅 [架构与核心设计（白话版）](docs/ARCHITECTURE_PLAIN.md)。

---

## 参与贡献

欢迎提交 Issue 与 Pull Request！

- 本地开发指南、Monorepo 目录职责以及调试测试流程，请参阅 [贡献指南 (CONTRIBUTING.md)](CONTRIBUTING.md)。
- 更多底层技术细节与交接规范，请查阅 [docs/ 目录文档](docs/)。

---

## 赞助

如果你觉得这个项目对你的跨端开发有所帮助，欢迎支持作者持续维护：

<p align="center">
  <a href="https://afdian.com/a/flippedround">
    <img alt="sponsors" src="https://cdn.jsdelivr.net/gh/FliPPeDround/sponsors/sponsorkit/sponsors.svg" />
  </a>
</p>

---

## License

[MIT](./LICENSE) License © 2024-PRESENT [FliPPeDround](https://github.com/FliPPeDround)
