# 功能细节与实现原理

> 本文从 README 移出，记录各面板背后的实现方式与限制，给想了解原理或排查问题的读者。用法见 [README](../README.md)。

Uni DevTools 解决的是 uni-app 小程序开发中三类问题：编译后信息丢失、闭包变量不可见、调试工具生态割裂。

## 组件树与状态检视（Components & State）

- **多页面映射为多 App 快照**：小程序页面栈（`getCurrentPages()`）和分包体系在运行时天然映射为独立的 App 实例快照，组件节点通过 `route#uid` 隔离，与官方 Client 顶部应用切换完全对齐。
- **编译期 AST 插桩还原文件名**：Vite / Webpack 插件在编译期拦截 `uniComponent://` 与 `uniPage://` 虚拟入口，注入 `__file` 属性，精准还原 SFC 源文件路径，消除编译后模板中的 `<Anonymous>`。
- **穿透闭包状态检视**：针对 Vue 3 `<script setup>` 编译器直接内联返回 render 函数导致局部变量不可见的问题，构建期通过 AST 插桩向返回函数挂载 `__uni_devtools_bindings__`，运行时安全读取闭包内的 ref / reactive 活值。
- **官方规范状态分组与徽标**：严格对齐官方 `props` / `data` / `setup` / `computed` / `attrs` 分组，附带 `(Ref)`、`(Reactive)`、`(Computed)` 徽标，并提供 computed 原始定义与求值 tooltip。
- **渲染钩子防抖推送**：编译期包装组件 render 钩子（`__uniDevtoolsNotifyRender`），组件更新时在约 300ms 内防抖推送到 Node 侧 `sharedState`，并内置快照哈希内容比对门控，避免动画或倒计时触发推送风暴。
- **深路径状态编辑与删除**：支持顶层变量、深层嵌套对象路径（`path: string[]`）、数组下标的实时修改与属性删除（`deleteReactive`），修改后自动触发失效事件驱动 UI 刷新。
- **查看渲染函数源码（Show Render Code）**：从已注册组件实例中提取 render 函数源码，自动解开插桩包装层，并按主体公共缩进归一化后展示。
- **源码一键直达（Open in Editor）**：从组件树或状态面板一键在本地编辑器打开对应源码文件，基于 Node 端 `launch-editor` 实现，并内置项目根目录越界安全守卫。

## 状态管理检视器（Pinia & Vuex Inspector）

- **Pinia（Vue 3）运行时自动探测**：直接从应用根实例（`$pinia` / `_s`）枚举 Stores，无需在用户业务代码中手动挂载代理插件；完整支持 Options Store 与 Setup Store；还原官方 `Pinia (root)` 聚合看板与各 Store 平级视图，支持深层 State 双向编辑与修改回写。
- **Vuex（Vue 2）多级降级探测**：针对 Vue 2 + Webpack 4 工程，采用三级降级策略（`getApp().$vm.$store` / `getApp().$store` / `Vue.prototype.$store`）可靠定位 Store 实例；支持 Root 及命名空间模块的 State / Getters 检视，并支持 State 深层路径编辑同步。

## 路由与页面栈（Pages & Navigation）

- **注册路由自动解析**：自动解析项目 `pages.json`（支持注释、尾随逗号及 `subPackages` 分包配置）。
- **动态页面栈监控**：动态展示当前小程序页面栈（`getCurrentPages()`）深度与路由参数。
- **面板交互导航与防叠栈**：支持在 DevTools 中触发 `navigateTo`、`redirectTo` 与 `switchTab`；内置“同页导航自动改用 redirect”策略，避免面板反复导航耗尽小程序 10 层页面栈上限。

## 响应式依赖图谱（Reactivity Graph）

- **Vue 3.5+ 链表追踪**：沿 Vue 3.5+ 响应式双向链表（`deps`/`nextDep`、`subs`/`nextSub`）递归遍历，采集 Setup 响应式源与 Render / Watcher 间的拓扑关系。
- **力导向拓扑呈现**：基于 d3-force 力导向图直观呈现响应式依赖关系。
- **版本门禁放宽与引导**：官方 3.6.0 门槛针对小程序生态放宽至 Vue 3.5.0；低于 3.5 时在面板中提供明确升级指引。

## 网络请求看板（Network Inspector）

- **全链路捕获**：拦截 `uni.request`、`uni.uploadFile`、`uni.downloadFile`，并降级拦截直接调用的 `wx.*` 同名 API（先装 uni 再装 wx，uni 的原始引用在装 wx 补丁之前已固化，不会重复计数）；透明透传原回调与 Promise 语义。
- **环形缓冲与增量同步**：探针端维护最多 500 条记录的环形缓冲区，单条报文进行 64KB 截断保护，500ms 防抖增量合并推送到 Node 侧。
- **瀑布图与报文抽屉**：按时序呈现请求流与精准瀑布耗时条形图，动态展示在途 pending 状态；抽屉支持查看 Headers、Query、Request Body、Response Body 及性能耗时指标。
- **AI Agent 诊断接口**：通过 `get-network-records`、`clear-network-records` 等 RPC，让外部 AI 助手直接获取网络调用诊断上下文。

## 构建管线检查（Vite Inspect）

- **转换流程与中间代码产物检查**：Node Sidecar 托管 `vite-plugin-inspect` 的构建产物，在 DevTools 独立标签页中通过 iframe 查看 Vite 插件管道的转换流程、耗时热点与中间代码。
