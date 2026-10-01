# Uni DevTools（devframe 重构）交接文档

> **给接手者**：本文档让你在零上下文的新会话里接手本项目。读完即可继续开发。
> 配套阅读（按优先级）：`docs/HUB_UI_SPECIFICATION.md`（设计契约）→
> `docs/DEVFRAME_MIGRATION_PLAN.md`（架构方案）→ `spike/devframe-poc/FINDINGS.md`（POC 踩坑）。
> 分支 `refactor/devfra`。**大量工作未提交 git**（见 §9 提交建议）。

## 1. 项目一句话

为 uni-app 小程序做一套 DevTools：**UI 直接整体移植官方 Vue Devtools client**（用户下载在仓库根
`devtools/`，是 vuejs/devtools 的 devframe 化重构版 v9-beta，MIT），**数据层用适配器桥到自研
devframe RPC → 小程序探针**。宿主是 devframe（Hub iframe / sidecar 直连两种形态）。

## 2. 仓库地图（只列关键）

```
packages/
├── panel/            ★ 面板 SPA（官方 client 源码 + 适配器），dist 即 devframe clientAssets
│   ├── src/adapter/uni-devtools-rpc.ts   ★★★ 唯一核心新代码（~430 行），协议桥
│   ├── src/adapter/fixtures.ts           ?mock 模式假数据（id 是 route#uid 格式）
│   ├── src/composables/devtools-connection.ts  官方源码改点：connectUniRpcClient 替换 connectDevtoolsClient
│   └── （其余为官方源码，共 6 处修改，均在文件内有 "uni-devtools" 注释标记）
├── devtools-kit/     vendored @vue/devtools-kit（协议/codec/rpc；exports 指向 src 源码；仅依赖 devframe@1.1.0）
├── devframe/         node 侧：DevframeDefinition + relay(AgentRegistry) + Vite 插件 + 探针 + e2e
│   ├── src/devframe.ts     4+1 个 RPC + sharedState('component-tree') 注册
│   ├── src/relay.ts        探针定向调用（rpcGroup.clients + ping 扫描兜底）
│   ├── src/plugin.ts       Vite 插件（sidecar createDevServer + 虚拟模块注入探针 + transform 注入 initAgent）
│   ├── src/agent/          探针（运行在小程序沙箱；tree.ts 采集 / state.ts 读写 / index.ts 连接+推送）
│   ├── scripts/e2e-node.mjs 机器验收（起 harness + 模拟探针 + 断言全链路）
│   └── scripts/dev.mjs     本地起 sidecar（打印带 token 的面板 URL）
├── panel-legacy/     旧 @antfu/design 面板留底（不再维护；其 df/client.ts 有历史借鉴价值）
├── hub-ui/           vendored 官方 hub-ui（外壳；playground/ 可起 hub 实例参考）
└── client/           更旧的 trpc 时代客户端（历史参照）
playground/           uni-app 小程序示例（vite.config 已接 UniDevtoolsPlugin）
devtools/             用户下载的官方仓库原样保留（参考源，勿改，已 gitignore）
design/               共享设计基座（uno.config / design.ts 类助手 / primary-ramp.css）
docs/                 本文档 + 规范文档
```

## 3. 架构与数据流

```
官方 Vue Devtools UI（不改）
  → useDevtoolsClient（官方 composable，不改）
  → devtools-connection（改 1 处：connectUniRpcClient）
  → ★适配器 uni-devtools-rpc.ts（实现 kit 的 DevtoolsRpcClient 接口：
      query/command/onEvent/onConnectionChanged/dispose）
  → devframe WS RPC（scope 'uni-helper-devtools'，官方 connectDevframe + URL token）
  → node 侧 relay（AgentRegistry 定向调用）
  → 小程序探针（注入的 agent，uni.connectSocket 连回）
```

**适配器映射总纲**（改协议前必读）：

- uni-app 每个页面 = 一个 AppSnapshot（多页下拉用官方 UI）；组件 id = `route#uid`（探针生成，
  appId 恒为 `id.split('#')[0]`）
- 探针嵌套树 → 扁平 `ComponentTreeNodeSnapshot[]`（官方无 children 字段）
- `treeSnapshot` 必须按 `request.appId` 过滤；`treePatched` 事件**必须带 appId**（官方入口
  `!event.appId || appId !== selectedAppId` 双重校验，漏了静默丢弃）
- 探针 `{data, setup}` → sections（`StateEntry.path[0]` = sectionId，值用 kit `encodeValue`
  maxDepth 8、不给 handle）
- **mp script setup 的状态读取**：uni 编译器把 script setup 绑定内联进 render 闭包
  （`setup()` 直接返回 render 函数），运行时没有 `setupState` 对象（uni 官方 devtools
  同样拿不到）→ 编译期插桩（`instrument.ts`，post transform）把闭包绑定引用挂上
  render 函数的 `__uni_devtools_bindings__` 属性，探针 `resolveSetupSource` 读回
  （ref/reactive 同引用 = 活值；纯值 const 不可编辑，如实报错）
- 编辑仅顶层键：`components:editState` → 探针 `updateComponentState(id, key, value)`，成功后
  emit `components:stateInvalidated`（appId 必填，version **按组件计数**）
- 树实时更新：探针推 `push-component-tree` → node 写 sharedState `component-tree` → 适配器订阅
  （`scoped.rpc.sharedState(key, opts)`，**不是** `scoped.sharedState.get`！）→ 按 appId 分组的
  「全删+全插」patch 集 → `components:treePatched`
- 探针侧变更检测：wx.onAppRoute + uni.addInterceptor + `__VUE_DEVTOOLS_GLOBAL_HOOK__`（mp 构建
  常缺失）+ **2s 快照比对兜底**（小程序改 data 的主路径）

## 4. 冻结契约（不许单方改；三处必须同步）

- RPC（scope `uni-helper-devtools`）：`ping` / `get-component-tree` / `get-component-state` /
  `update-component-state` / `push-component-tree`，形状见 `packages/devframe/src/types.ts`
- 编译期插桩（plugin 的 `uni-devtools-instrument` post transform ↔ 探针读取端）：
  - `__file`：注入在 uni 虚拟入口（`uniComponent://` / `uniPage://`）的
    createComponent/createPage 之前，探针命名链兜底用它取 basename
  - `__uni_devtools_bindings__`：挂在 setup 返回的 render 函数上（属性名两端字面量
    冻结同步：`instrument.ts` ↔ `agent/state.ts`）
- 组件 id：`route#uid`（探针 tree.ts 生成；改了要同步 fixtures 与适配器 appId 推导）
- 面板产物路径：`packages/panel/dist`（`resolveClientAssets()`：env `UNI_DEVTOOLS_PANEL_DIR`
  → panel/dist → devframe/assets/panel 兜底）

## 5. 如何运行 / 验证

```bash
pnpm --filter @uni-helper/devtools-panel build     # 面板构建（产物即被 sidecar 托管）
pnpm --filter @uni-helper/devtools-panel dev       # 面板 dev（配 ?mock 无需后端）
node packages/devframe/scripts/e2e-node.mjs       # 机器验收（应全绿 5+2 项）
node packages/devframe/scripts/dev.mjs            # 本地起 sidecar，打印带 token 面板 URL
cd playground && pnpm dev:mp-weixin               # 真机链路（微信开发者工具需开服务端口+不校验域名）
```

**mock 冒烟**：面板 URL 加 `?mock`（fixtures 数据，右下角常驻 MOCK 角标）。
**CDP 自动化**：历史驱动脚本在 `/tmp/vd-*.mjs`（可能已清）；要点：chrome-headless-shell +
`--remote-debugging-port`；注意页面是**三栏**（AppList/树/状态，apps>1 时），状态面板是
`panes[2]`；编辑用 `Input.dispatchKeyEvent`（合成 KeyboardEvent 不触发 Vue keydown）。

## 6. 已完成与验证状态

- ✅ 官方 client 移植 + 适配器（P2/P7）；playground 正式接插件（P5）；多页树/编辑/命令面板/主题
  全链路（经 agy 两轮 CR，13 项发现全修复，报告在批次目录）
- ✅ 双向数据：小程序改 → sharedState → 面板实时（真机最终确认**待用户复验**，见 §8）
- ✅ e2e / typecheck(0 错) / build / mock 回归全绿
- ✅ 匿名组件文件名命名 + mp script setup 状态读取/编辑（编译期插桩方案，产物
  38 文件语法全检通过 + vitest 10 例；**待用户真机复验**）
- ⏳ **待用户真机复验**：P9 直连修复（两个真因见 §7）后用户尚未回报刷新面板的结果

## 7. 血泪教训（必读，全是修过的真 bug）

1. **kit 命令语义**：`RuntimeCommandResult.status` **1=成功、0=失败**（像退出码，反直觉）
2. **客户端 sharedState 入口**：`scoped.rpc.sharedState(key, opts)`；`scoped.sharedState` 不存在
   （scope keys 只有 namespace/base/rpc/settings/scope）
3. **不许提前上报 connected**：connectDevframe resolve 时多为 connecting；提前上报会让官方层
   hasEverConnected 提前置位 → 真实 connected 被当「重连」→ 双刷新竞态拆连接（死循环断连）
4. **`createWsRpcChannel` 的 authToken option 无条件用 `?` 拼 URL**：URL 已带 query 时 token 被吞
   → DF0036（e2e 因此手拼 URL）
5. **探针多页 uid 撞车**：Vue uid 按 app 计数，必须 `route#uid` 命名空间
6. **探针代码禁浏览器 API**（window/document/location）；`devframe/rpc` 会拖 node:crypto 炸 mp
   构建（用 `devframe/rpc/client` + `devframe/utils/structured-clone`）
7. **uni-app mp dev = vite build --watch**：无 dev server，`configureServer` 不执行，插件必须
   `createDevServer`（devframe/adapters/dev）自建 sidecar
8. **面板是 iframe 时**主题由父窗口 `.dark`/`.light` class 跟随（官方 color-mode 已内置）+
   storage 键 `devframes-color-scheme`；standalone 直连 token 在 URL `?devframe_auth_token=`
9. **官方 client 页面修改须克制**：现有 6 处均有 `uni-devtools` 注释标记；风格上**不要**格式化
   官方源码（lint 已在根 eslint ignores 排除移植包）
10. **mp script setup 无 setupState（已解）**：绑定被编译进 render 闭包，运行时无从枚举闭包
    变量——只能在**编译期**捕获（`instrument.ts` 用 rollup `this.parse` 做 AST 定位，形状
    不符一律原样放行不炸构建）；同理 plain `<script>` SFC / layout 产物无 `__name`/`__file`，
    文件名也是编译期从 `uniComponent://` 虚拟入口 id（base64url 可逆）注入的。
    单测：`packages/devframe/test/instrument.test.ts`（vitest，10 例）

## 8. 下一步（按优先级）

1. **等用户真机复验 P9**（刷新面板页；若仍断连，按 §7-2/3 复查，本地 `dev.mjs` 可复现）
2. openInEditor：node 侧加 RPC（devframe 有现成 `./utils/launch-editor`），capabilities 置 true
3. 探针嵌套路径编辑（updateComponentState 支持深 path；面板侧已如实报「暂不支持」）
4. Pinia / 路由 / Timeline：沿适配器补 inspectors/router/timeline 协议（tab 已置灰占位，
   `constants/tabs.ts` 去掉 disabled 即启用）
5. 树推送粒度优化：2s 比对兜底 → 探针侧 Vue effect 钩子（受 mp 构建限制，见 FINDINGS）
6. 提交 git（见 §9）

## 9. 未提交改动（git 状态）

`design/`、`packages/hub-ui/`、`packages/panel*/`、`packages/devtools-kit/`、`packages/devframe/`、
`spike/`、`docs/`（含本文档）、`alias.ts`、`eslint.config.js`、`playground/`（vite.config/package.json）
均为未提交状态。**建议按里程碑分批提交**（panel 移植 / devframe 包 / playground 接线 / 文档），
`devtools/`（官方下载）与 `devframe-docs/` 已 gitignore 勿提交。

## 10. 团队协作（seedmux）

主持人 claude（本会话）+ agy（评审/实现 pane，额度会耗尽需 respawn）。批次记录：
`~/.seedmux/team/batches/B-panel-0930/batch.md`（P1–P9 全程记录 + agy 两份 CR 报告
`P2-review-agy.md` / `P8-review-agy.md`）。新会话可沿用该批次或新开；工单模式见
`~/.claude/skills/seedmux-team/`。
