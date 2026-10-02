# Uni DevTools（devframe 重构）总交接文档

> **给接手者**：本文档让你在零上下文的新会话里接手本项目，读完即可继续开发。
> 配套阅读（按优先级）：`docs/HUB_UI_SPECIFICATION.md`（设计契约）→
> `docs/DEVFRAME_MIGRATION_PLAN.md`（架构方案）→ `spike/devframe-poc/FINDINGS.md`（POC 踩坑）。
> 分支 `refactor/devfra`，两个批次（B-panel-0930 面板移植 / B-features-1002 功能批次）
> 全部工作已提交并过 CR。

## 1. 项目一句话

为 uni-app 小程序做一套 DevTools：**UI 整体移植官方 Vue Devtools client**（用户下载在仓库根
`devtools/`，是 vuejs/devtools 的 devframe 化重构版 v9-beta，MIT，已 gitignore 勿改），
**数据层用适配器桥到自研 devframe RPC → 小程序探针**，**编译期插桩补回 mp 构建丢失的信息**。
宿主是 devframe（Hub iframe / sidecar 直连两种形态）。

## 2. 功能矩阵（当前能力）

| 功能                                                                                                                             | 状态        | 入口                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------- |
| 组件树（多页=多 app、文件名命名、实时推送 ~0.3s）                                                                                | ✅          | Components 标签            |
| 状态查看（官方分组 props/data/setup/setup-other/computed/attrs + (Computed)/(Ref)/(Reactive) 徽标 + computed tooltip/recompute） | ✅          | 同上，右侧 State 面板      |
| 状态编辑（顶层 + **深路径**、数组索引、删除）                                                                                    | ✅          | 值行铅笔按钮               |
| Pinia 检查器（stores 树、State/Getters、编辑+失效刷新）                                                                          | ✅          | Pinia 标签（官方内建映射） |
| 路由页面栈（pages.json 注册路由 + 当前栈 + 匹配 + 导航）                                                                         | ✅          | Pages 标签                 |
| openInEditor（launch-editor + 项目根越界守卫）                                                                                   | ✅          | 树行文件名 / 状态行动作    |
| Timeline                                                                                                                         | ⏸ 有据降级 | tab 禁用（结论见 §7 W6）   |
| graph / plugins / 组件 DOM 定位（inspectDom/highlight）                                                                          | ❌ 未做     | tab 禁用                   |

## 3. 仓库地图（只列关键）

```
packages/
├── panel/            ★ 面板 SPA（官方 client 源码 + 适配器），dist 即 devframe clientAssets
│   ├── src/adapter/uni-devtools-rpc.ts   ★★★ 唯一核心桥（kit 协议 ↔ devframe RPC）
│   ├── src/adapter/fixtures.ts           ?mock 假数据（组件 + Pinia 双 store）
│   ├── src/composables/devtools-connection.ts  官方改点：connectUniRpcClient + vite stub 桥接
│   ├── src/components/nav/SideNavItem.vue      官方改点：点击死代码修复（§8-13）
│   └── （官方源码共 7 处改动，均有 "uni-devtools" 注释标记）
├── devtools-kit/     vendored @vue/devtools-kit（协议/codec/rpc；exports 指 src；仅依赖 devframe@1.1.0）
├── devframe/         node 侧 + 探针 + 编译期插桩
│   ├── src/devframe.ts     DevframeDefinition + 12 个 RPC + sharedState('component-tree')
│   ├── src/relay.ts        AgentRegistry 定向调用（探针不可信校验）
│   ├── src/plugin.ts       Vite 插件（sidecar + 虚拟模块注入探针 + instrument post transform）
│   ├── src/instrument.ts   ★ 编译期插桩（__file 注入 / 闭包绑定捕获 / render 钩子包装）
│   ├── src/agent/          探针（小程序沙箱；禁浏览器 API）
│   │   ├── tree.ts     树采集 + 实例注册表 + 命名链
│   │   ├── state.ts    组件状态读写（深路径语义）
│   │   ├── pinia.ts    Pinia 采集（免注入，app 实例枚举 _s）
│   │   ├── render-hook.ts  渲染钩子运行时半边（参数全转发）
│   │   ├── push.ts     推送调度（防抖 + 内容比对门）
│   │   └── serialize.ts    共享序列化/ref 判定
│   ├── test/               vitest 38 例（instrument/pinia/router/open-in-editor/render-hook）
│   ├── scripts/e2e-node.mjs 机器验收（5+2 项全链路）
│   └── scripts/dev.mjs     本地起 sidecar（打印带 token 面板 URL）
├── panel-legacy/     旧 @antfu/design 面板留底（不再维护；df/client.ts 有历史借鉴价值）
├── hub-ui/           vendored 官方 hub-ui 外壳（参考）
└── plugin/           上一代 trpc 插件（openCommands/piniaProxy 的历史参照）
playground/           uni-app 小程序示例（已接 UniDevtoolsPlugin + 大量 demo 组件）
design/               共享设计基座（uno.config / design.ts / primary-ramp.css）
devtools/             官方仓库下载（参考源，勿改，已 gitignore）
```

## 4. 架构与数据流（三层）

```
【编译期】vite plugin（devframe/dist/plugin.mjs，enforce post instrument）
  ① uniComponent:// 虚拟入口注入 __file（base64url 解码回源路径）→ 匿名组件文件名命名
  ② 「setup 返回 render 函数」形态改写：
     return Object.assign(__uni_devtools_notify_render(renderFn),
                          { __uni_devtools_bindings__: { 闭包绑定名... } })
     → script setup 状态可读可编辑 + 每次渲染调度树推送
  ③ plain <script> 的 _export_sfc render 引用同样包钩子

【运行期-小程序侧】agent（注入 main.ts）
  tree/state/pinia 采集 ── push.ts（防抖+比对门）──► WS ──► node relay
  wx.onAppRoute + uni.addInterceptor + 2s 快照比对兜底

【node 侧】devframe Definition（sidecar，createDevServer 自建 HTTP+WS）
  12 个 RPC + sharedState('component-tree') ← 定向调用探针（AgentRegistry）

【面板侧】官方 client（不改）→ useDevtoolsClient → 适配器（uni-devtools-rpc.ts）
  page=app / 嵌套树→扁平快照 / {data,setup}→sections / inspectors 协议(Pinia)
  / router 协议(Pages) / editState 深路径透传 / openInEditor 桥接
```

mp 专属事实（改协议前必读）：uni 编译器把 script setup 绑定**内联进 render 闭包**，
运行时没有 `setupState` 对象（官方 vue-devtools 同样拿不到）——所以必须编译期捕获；
plain `<script>` SFC / layout 产物无 `__name`/`__file`——文件名也是编译期注入。

## 5. 冻结契约（不许单方改；多处同步）

**RPC（scope `uni-helper-devtools`，共 13 个，形状见 `packages/devframe/src/types.ts`）**

- 基础 6：`ping` / `get-component-tree` / `get-component-state` / `update-component-state` / `push-component-tree` / `recompute-component-state`
- W2：`open-in-editor`（launch-editor + getProjectRoot 三级推断 + 越界拦截）
- W5：`get-registered-routes`（pages.json 解析，容注释/尾逗号/subPackages）/ `get-router-info`（getCurrentPages 栈）/ `navigate-to`
- W4：`get-pinia-stores` / `get-pinia-state` / `update-pinia-state`

**状态契约（ComponentStateResult）**：对齐官方分组 props / data / setup / setupOther / computed / attrs；setup 绑定经 getSetupBindingInfo 判定输出 (Computed)/(Ref)/(Reactive) 徽标与 raw 源码 tooltip；函数/组件样对象归入 setupOther；recompute-component-state 仅支持 setup 段 computed ref 触发重算。

**编译期插桩（`instrument.ts` 写入端 ↔ 探针读取端，字面量冻结同步）**

- `__file`：虚拟入口 createComponent/createPage 前守卫注入；命名链兜底取 basename
- `__uni_devtools_bindings__`：挂 setup 返回的 render 函数上（`instrument.ts` ↔ `agent/state.ts`）
- `__uniDevtoolsNotifyRender`：render 包装钩子，子路径导出 `./agent/render-hook`
  （package.json exports 冻结同步；**必须转发全部实参**，见 §8-14）

**编辑语义（W3）**：官方 `{ componentId, sectionId, path: [key, ...nested], value, remove }`
→ 探针 `{ id, section, path, value, remove }`（legacy `{id,key,value}` 兼容）；逐段解 ref 下钻；
不可导航/键不存在如实报错。

**Pinia inspector（W4）**：nodeId = `store:<id>`；每条 entry 必须带
`meta: { inspectorId: 'pinia', nodeId, disableAdd }`（官方编辑路由靠它，漏注=编辑静默无效）；
componentId 用官方合成约定 `inspector:<inspectorId>:<nodeId>`；编辑失效事件名是
`inspectors:stateInvalidated`（**事件名**，不是 command 名 `invalidateState`）且必须带 `reason`；
getters 标 `editable: false`。

**其他**：组件 id = `route#uid`（appId 恒为 `id.split('#')[0]`；改了同步 fixtures 与适配器）；
面板产物路径 `resolveClientAssets()`（env `UNI_DEVTOOLS_PANEL_DIR` → panel/dist → assets/panel 兜底）。

## 6. 如何运行 / 验证

```bash
pnpm --filter @uni-helper/devtools-panel build     # 面板构建（产物被 sidecar 托管）
pnpm --filter @uni-helper/devtools-panel dev       # 面板 dev（配 ?mock 无需后端）
pnpm --filter @uni-helper/devtools-devframe build  # 重建 dist/plugin.mjs（改了 src 必须）
npx vitest run packages/devframe/test/             # 单测（38 例）
node packages/devframe/scripts/e2e-node.mjs        # 机器验收（5+2 项）
node packages/devframe/scripts/dev.mjs             # 本地 sidecar（打印带 token 面板 URL）
cd playground && pnpm dev:mp-weixin                # 真机链路（微信 IDE 需开服务端口+不校验域名）
```

**验证分层**：vitest（探针/插桩纯逻辑）→ e2e（RPC 管道全链路）→ `node --check` 全产物
（语法）→ CDP mock 冒烟（面板 UI 行为）→ 真机（最终裁判）。
**注意**：改探针/插桩代码只过语法检查不够——render 包装类改动必须单测覆盖参数转发
（render-hook.test.ts）或真机验证（§8-14 教训）。

**mock 冒烟**：面板 URL 加 `?mock`。CDP 驱动要点：chrome-headless-shell
（`~/Library/Caches/ms-playwright/chromium_headless_shell-1228/...`）+ `Input.dispatchMouseEvent`
（可信点击）；编辑 = 点行上铅笔按钮（aria-label="Edit state value"）→ `Input.insertText` →
回车用 `Input.dispatchKeyEvent`（合成 KeyboardEvent 不触发 Vue）。

## 7. 批次历史（详见 `~/.seedmux/team/batches/`）

**B-panel-0930（面板移植批次，P1-P10）**：官方 client 整体移植 + vendored kit + 适配器 +
playground 接线 + 双向数据 + 两轮 agy CR（13 项全修）+ P9 直连修复 + 文档体系。

**B-features-1002（功能批次，2026-10-02 夜，claude 主持人 + agy，W1-W9）**：

| 项  | 内容                                                                                                                                                         | commit           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| W1  | git 分批提交（此前全部未提交工作按里程碑落盘，11 commits）                                                                                                   | 045b351..d509e03 |
| W2  | openInEditor 全链路（agy）                                                                                                                                   | 35148f8          |
| W3  | 嵌套路径编辑（探针+适配器）                                                                                                                                  | baef695          |
| W4  | Pinia custom inspector（免注入采集+官方协议+mock）                                                                                                           | 854a62c+ef85f44  |
| W5  | 路由页面栈 Pages 标签（agy）                                                                                                                                 | f26f542          |
| W6  | Timeline **有据降级**（agy 调查：纯 push 无快照+4 大 Web 硬编码图层+mp 无 DOM/Performance；后续 3~4 人日方案留档 `~/.seedmux/team/tasks/T-2d81ad/reply.md`） | 8ce9ade          |
| W7  | 渲染钩子树推送（~0.3s，2s 轮询降级为兜底）                                                                                                                   | 5853254          |
| W8  | 文档 + mock 冒烟（**意外抓到 SideNavItem 官方死代码**并修复）                                                                                                | 8ce9ade/29ce8cc  |
| W9  | 主持人 CR：3 P0 + 1 P1 + 3 P2 全修（见下）                                                                                                                   | f8ef5d4          |

**W9 CR 发现（都已修复，教训进 §8）**：P0-1 render 钩子只转发前 2 参（plain/Options 组件
渲染即崩）；P0-2 inspector 失效事件名写反（编辑后不刷新）；P0-3 inspector entry 缺 meta
注入（编辑静默无效）；P1-1 渲染钩子推送风暴；P2 修饰键语义/getters 可编辑性/mock 抛错对齐。
CR 验证：vitest 38/38 + e2e 5+2 + tsc 0 + 双 build + 产物语法全检 + CDP mock 编辑闭环冒烟
（铅笔→输入 42→回车→count:42 刷新、编辑器收起、零异常）。

## 8. 血泪教训（必读，全是修过的真 bug）

1. **kit 命令语义**：`RuntimeCommandResult.status` **1=成功、0=失败**（像退出码，反直觉）
2. **客户端 sharedState 入口**：`scoped.rpc.sharedState(key, opts)`；`scoped.sharedState` 不存在
   （scope keys 只有 namespace/base/rpc/settings/scope）
3. **不许提前上报 connected**：提前谎报 → hasEverConnected 提前置位 → 真实 connected 被当
   「重连」→ 双刷新竞态拆连接（死循环断连）
4. **`createWsRpcChannel` 的 authToken 无条件用 `?` 拼 URL**：URL 已带 query 时 token 被吞
   → DF0036（e2e 因此手拼 URL）
5. **探针多页 uid 撞车**：Vue uid 按 app 计数，必须 `route#uid` 命名空间
6. **探针代码禁浏览器 API**（window/document/location）；`devframe/rpc` 会拖 node:crypto 炸
   mp 构建（用 `devframe/rpc/client` + `devframe/utils/structured-clone`）
7. **uni-app mp dev = vite build --watch**：无 dev server，`configureServer` 不执行，插件必须
   `createDevServer`（devframe/adapters/dev）自建 sidecar
8. **面板是 iframe 时**主题由父窗口 `.dark`/`.light` class 跟随（官方 color-mode 已内置）+
   storage 键 `devframes-color-scheme`；standalone 直连 token 在 URL `?devframe_auth_token=`
9. **官方 client 修改须克制**：共 7 处（connection×2/color-mode/uno/tabs/字体/SideNavItem），
   均有 uni-devtools 注释标记；不格式化官方源码（lint ignores 已排除移植包）
10. **mp script setup 无 setupState（已解）**：绑定被编译进 render 闭包，运行时无从枚举闭包
    变量——只能在**编译期**捕获（`instrument.ts` 用 rollup `this.parse` 做 AST 定位，形状
    不符一律原样放行不炸构建）；文件名同理从 `uniComponent://` 虚拟入口 id（base64url
    可逆）注入
11. **双 watch 进程打架**：残留旧 `dev:mp-weixin` 持旧插件代码竞争写 dist，产物「时对时错」
    ——排查产物问题先 `pgrep -fl dev:mp-weixin` 清进程；**注入代码经 uni 打进
    `common/vendor.js`**，grep 产物要用导出原名（如 `__uniDevtoolsNotifyRender`），不是注入
    处的本地别名
12. **mock fixtures 必须深拷贝返回**：真实传输层每次响应都是全新对象，mock 返回同一引用
    会切断 Vue computed 链（只有 mock 环境才出现的假 bug）
13. **Vue 内联三元 handler 只求值不调用**：`@click="cond ? undefined : fn"` 编译为
    `$event => (cond ? undefined : fn)`——fn 永不执行，点击回落 `<a href>` 整页跳转
    （官方 SideNavItem 即此写法，被官方宿主掩盖；standalone 下丢 ?mock 引发 Pinia 树空白
    假象）。排查工具：CDP 可信输入事件（`Input.dispatchMouseEvent`）+ 看点击后
    `location.href`；合成 MouseEvent 需 `cancelable: true` 否则 preventDefault 无效
14. **render 包装必须转发全部实参**（CR P0-1）：mp 运行时以 7 参调 render（proxy,
    renderCache, props, setupState, data, ctx），plain `<script>`/Options 组件的编译 render
    是 6 参签名且用 $setup/$data——只转发前 2 参渲染即崩；**代码生成+语法检查都测不出**，
    要单测（render-hook.test.ts）或真机。实现：具名前两参 + rest（length 保持 2）
15. **事件名 ≠ command 名**（CR P0-2）：失效事件是 `inspectors:stateInvalidated`
    （command 叫 invalidateState）；写反被官方事件入口**静默丢弃**。对照
    `devtools-kit/src/runtime/types.ts` 的 RuntimeDomainEvent 联合，必填字段别漏（如 reason）
16. **inspector entry 必须带 meta**（CR P0-3）：官方编辑路由靠 `entry.meta.inspectorId/nodeId`
    （kit toInspectorLegacyStateEntries 同款注入 `{inspectorId, nodeId, disableAdd}`）；漏注
    会静默路由到 components:editState 且 inspector 页无选中组件 → 编辑完全无效且无报错
17. **推送要带内容比对门**（CR P1-1）：渲染钩子让每次渲染都调度推送，动画页面=300ms 全量
    推送风暴；门在 push.ts（lastPushedTreeJson），实例重建时必须重置（防 sidecar 重启后
    首推被挡）
18. **同 route 多实例是两层 bug**（用户真机反馈，第一轮只修了一半）：
    ① 探针 navigate 原先一律 `uni.navigateTo`——Pages 面板反复导航当前页把同一页面
    压 N 份（mp 栈上限 10）。修复：目标与栈顶同页（归一化去 query 比路径）改
    `redirectTo`，tabBar 兜底 switchTab 保留；决策在 `agent/navigate.ts`（10 例单测）。
    ② 更深的一层：Vue uid 按页面实例计数，同 route 压两次栈 → 两实例节点 id 全是
    `route#1` 互相撞车、appId 也重复——面板按 appId 过滤把两棵树**合并成乱序重复树**，
    treePatched 按 id 去重再互相覆盖。修复：`tree.ts` 对栈内第 2+ 次出现的 route 追加
    出现序号（`pages/index@2`，首个保持裸 route，单实例契约/fixtures 不变；4 例单测
    `tree.test.ts`）。排查教训：**改了 dist/plugin.mjs 必须重启 dev:mp-weixin watch**
    ——运行中的 vite 持旧插件内存态，重建 dist 不会热更，产物「看起来新其实旧」
19. **Vitest 断言对象时 pretty-format 会触发可枚举 getter**：在测试桩里手造含 getter 的 ref（如 `get value()`）时，若该属性为自身可枚举属性，vitest 断言失败输出 diff 或匹配 `objectContaining` 时会调用 pretty-format 遍历属性求值，引发意外的二次求值使得调用计数断言失败（如 callCount 1 变 2）。手造 ref 应遵循 Vue 运行时原型设计，使用 `Object.defineProperty(obj, 'value', { get, enumerable: false })` 定义 getter。

## 9. 下一步（按优先级）

1. **用户真机复验**（唯一未闭环项）：微信 IDE 重编译 + 刷新面板，核对——
   匿名组件显示文件名 / script setup 右侧 Setup 实时值 / 深路径编辑（嵌套对象、数组项）/
   Pinia 标签（选 store → State/Getters → 编辑 count）/ Pages 标签（路由列表+当前栈+导航）/
   openInEditor 按钮 / 改数据 ~0.3s 到面板
2. Pinia 实时推送：目前拉取式（选中才读），可加探针 $subscribe → invalidateState 事件
3. W6 Timeline 后续（若要做）：见 T-2d81ad reply 的 3~4 人日方案
   （官方页解耦 / 编译期插桩采集 / 环形缓冲批量推送）
4. 已知小缺口：Pinia treeSnapshot 每次过滤击键都打一次探针 RPC（可加短缓存）；
   探针离线时 Pinia/Pages 面板为空态（无离线缓存）
5. 分支整理：`refactor/devfra` 30+ commits 未推送，可择机 push / 开 PR 到 main

## 10. git 状态

全部工作已提交（B-panel-0930 时代的工作在 W1 分批落盘；B-features-1002 每项独立 commit；
CR 修复 f8ef5d4）。工作树干净。`devtools/`（官方下载）与 `devframe-docs/` 已 gitignore 勿提交。
`dist/` 产物（panel/dist、devframe/dist、playground/dist）随代码重新生成，不入库。

## 11. 团队协作（seedmux）

主持人 claude + agy（pane `05ABF496`，本批工单 T-57fe3e openInEditor / T-79c804 路由 /
T-2d81ad Timeline 降级；额度会耗尽需 respawn）。批次记录：
`~/.seedmux/team/batches/B-panel-0930/batch.md`（P1-P10 + 两份 CR 报告）与
`~/.seedmux/team/batches/B-features-1002/batch.md`（W1-W9）。工单模式见
`~/.claude/skills/seedmux-team/`。
