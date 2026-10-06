# mock 数据源解耦方案（mockMode → ProbeBackend）

> 状态：**已实施**（2026-10-06，§7 四个 Phase 全部落地，实施记录见 §11）
> 范围：`packages/adapter`（主）、`packages/client`（两处小改）、`packages/shared`（isMockPanelUrl）
> 前置讨论：mockMode 现状耦合分析与业界参照（Chrome DevTools / Vue DevTools / MSW），见 §1.3

---

## 1. 背景与问题

### 1.1 mockMode 现状

`packages/adapter/src/uni-devtools-rpc.ts:82` 定义了模块级布尔开关：

```ts
export const mockMode = typeof window !== 'undefined'
  ? new URLSearchParams(window.location?.search ?? '').has('mock')
  : false
```

用途唯一且正当：面板 URL 带 `?mock` 时，所有 query/command 改从 `fixtures.ts` 的内存假数据取值，
使面板 UI 的开发与回归**不必起小程序 + devframe 服务端的完整链路**。`client/src/main.ts` 另用它
挂常驻 "MOCK" 角标，防止假数据被误当真。

### 1.2 三个耦合点

1. **mock 分支散布约 19 处**。`if (mockMode)` 内联在 `uni-devtools-rpc.ts` 每个 query/command
   分支的取数叶子上（tree / state / pinia×3 / router×2 / render code / 编辑×3 / navigate /
   recompute / capabilities），外加 `initConnection` 整段早退与文件尾的条件自连。
   现在单文件尚可维护；**一旦按域拆分 `uni-devtools-rpc.ts`（component / router / pinia /
   network），每个域文件都要各自带一遍 mock 分支，重复随拆分倍增**。
2. **模块级隐藏全局**。`mockMode` 在模块导入时一次性读 `window.location`，不可注入、
   测试不可翻转——这是 mock 分支至今零测试覆盖的直接原因（现有测试全部绕路
   `vi.mock('devframe/client')` 测真实路径）。
3. **client 反向依赖**。`client/src/main.ts` 为一个 UI 角标 import adapter 的 `mockMode`。
   "URL 是否含 `?mock`"是 client 自己的展示层关切，不该为此依赖 adapter。

另有顺带问题：`adapter/src/index.ts` 的 `export * as fixtures` 与 `export *` 重复导出，
且 fixtures 因静态 import 链**当前已无条件进入 client 生产 bundle**。

### 1.3 业界参照（结论先行的三句话）

- **Chrome DevTools 前端**：`InspectorFrontendHost` 是面板与浏览器宿主之间的窄接口；
  独立打开（`isHostedMode() === false`）时在入口换成 `InspectorFrontendHostStub` +
  `StubConnection`，面板逻辑里没有一个 `if (stub)`。stub 是**宿主接口的一个完整实现**，
  不是渗进面板的分支。
- **Vue DevTools（本项目 vendored kit 的上游）**：同一 client，按环境换 connect 函数
  （扩展 / Vite 插件 / Electron / standalone），kit 只定义 `DevtoolsRpcClient` 接口。
  本仓库 `connectUniRpcClient()` 与 `devtools-connection.ts` 的换装点正是对该架构的镜像。
- **MSW**："在 network 层拦截，应用对 mock 零感知"。面板数据源是 RPC 不是 HTTP，MSW 不能直接套，
  但边界原则相同：**mock 放在 UI 的下游边界上，而不是 UI/路由逻辑里**。

三家殊途同归：**mock = 后端接口的另一个实现，在连接点选一次**。`?mock` 这个触发方式本身
（URL 参数 / hosted-mode 判断）属于入口级关切，业界同款，保留不动；要改的只是分支的寄生位置。

---

## 2. 目标与非目标

### 目标

1. `uni-devtools-rpc.ts` 中 mock 相关代码清零（`mockMode`、19 处分支、`mockRouterSnapshot`、
   条件自连全部移出）。
2. mock 链路可测试：mock 实现与协议语义各自有测试覆盖。
3. `packages/client` 不再 import 任何 mock 语义（角标读自己的 URL）。
4. mock 保真度提升：mock 推送/响应走与真实链路相同的协议形状与校验路径。
5. 为后续按域拆分 `uni-devtools-rpc.ts` 扫清障碍（本方案不做拆分本身）。

### 非目标

- 不改 RPC 方法名与协议（node 侧零感知）。
- 不改 `mapping/`（`test/mapping` 继续冻结）。已核对：`mapping/` 对 `mockMode`/`mock*`
  **零依赖**（全量 grep 仅命中 `fixtures.ts` 与 `uni-devtools-rpc.ts`），本方案不触碰该目录。
- 不改 `fixtures.ts` 的数据内容（纯数据文件，原样保留）。
- 不引入 MSW（见 §1.3）。
- 不在本方案内拆域 router。

---

## 3. 核心设计

### 3.1 关键洞察：`callUni` 是唯一咽喉

`uni-devtools-rpc.ts` 里所有真实数据访问都收敛在 `callUni(method, ...args)`（约 15 个探针方法）。
把 `callUni` 背后抽象成**探针数据面接口 `ProbeBackend`**，给两个实现：

- `DevframeBackend`：包住现有 `initConnection` 的传输部分（connectDevframe + socket 等待 +
  sharedState 订阅）；
- `MockBackend`：fixtures 的内存实现，按方法名分发。

路由器面向接口，mock 分支全部坍缩为普通的 `callUni` 调用。

> **为什么不做"第二个完整 client"（`connectMockRpcClient` 整套实现协议）**：
> 协议语义——按 appId 拆 patch、Pinia 聚合根组装、version 防陈旧计数、失效事件名——
> 会整套复制一份并必然漂移。mock 的意义是让面板面对**同一套**协议。Chrome DevTools 的
> Stub 实现的是宿主窄接口而非协议本身，同理；`callUni` 的方法面就是本项目的那个窄接口。

### 3.2 接口草图

```ts
// packages/adapter/src/backend.ts

/**
 * 探针方法全表，与 node 侧 rpc-names 一一对应。
 * node 侧新增方法时先加这里：方法名漂移在编译期暴露；
 * MockBackend 用 satisfies + 未知方法运行时 throw 双保险（见 §3.3）。
 */
export type ProbeMethod =
  | 'get-component-tree' | 'get-component-state' | 'update-component-state'
  | 'get-component-render-code'
  | 'get-pinia-stores' | 'get-pinia-state' | 'update-pinia-state'
  | 'get-network-records' | 'clear-network-records'
  | 'get-registered-routes' | 'get-router-info' | 'navigate-to'
  | 'open-in-editor' | 'get-inspect-status' | 'recompute-component-state'

export type ProbePushKey = 'component-tree' | 'network-records'

/**
 * 两段式订阅（评审 P0-1）：消除"await 期间 dispose"竞态。
 * 退订是同步、幂等的，任何时刻调用都安全。
 */
export interface ProbeSubscription {
  /** 订阅建立完成；reject = 建立失败，调用方按现有语义退化为主动拉取 */
  ready: Promise<void>
  /** 幂等；ready resolve 前调用 = 标记待退订（resolve 后立即退订）；reject 后调用 = no-op */
  unsubscribe(): void
}

/**
 * 探针数据面：路由器（uni-devtools-rpc）唯一可见的后端抽象。
 * 真实实现包 devframe RPC；mock 实现 wraps fixtures。
 */
export interface ProbeBackend {
  /** 静态能力位：真实 = { openInEditor: true }；mock = false（官方 UI 自动隐藏入口） */
  capabilities: { openInEditor: boolean }
  /** 建立传输连接：resolve 即就绪；throw 即失败（错误文案原样透传 UI） */
  connect(authToken?: string): Promise<void>
  /** 连接断开回调（mock 永不触发）；返回退订函数 */
  onConnectionLost(cb: () => void): () => void
  /** 探针方法面（拉取 + 写回）；未知方法实现方必须 throw（fail loud） */
  call(method: ProbeMethod, ...args: unknown[]): Promise<unknown>
  /** push 通道（与 node 侧 sharedState key 对应） */
  subscribe(key: ProbePushKey, cb: (snapshot: unknown) => void): ProbeSubscription
  /** 幂等；任何时刻可调用（含 connect / subscribe 尚未 settle 时） */
  dispose(): void
}
```

**类型约束的取舍（评审 P2-7）**：方法名取**字面量联合**（评审方案 A）——编译期防方法名漂移，
成本一行。**不采纳**方案 B（args/return 全类型映射表）：探针 payload 本就跨 kit 边界以
unknown 传输、其形状由 `mapping/` 层冻结并测试守护，方法表再包一层类型映射的维护成本
大于类型收益（多数 args 是 kit 透传的松散对象，强类型只会把 `as` 转移到调用点）。

### 3.3 方法面对照表（mock 分支的去向）

| 探针方法 | mock 实现（现分支位置） | 备注 |
| --- | --- | --- |
| `get-component-tree` | `mockComponentTree()`（L271 `pullTreeOnce`） | |
| `get-component-state` | `mockComponentState()`（L581） | |
| `update-component-state` | `mockUpdateComponentState()`（L719） | 深路径/remove 的 NOT_SUPPORTED 校验（L717-718）移入 mock 实现内 throw，面板看到 `status:0` + 文案不变 |
| `get-component-render-code` | `mockGetComponentRenderCode()`（L685） | 未知 id 返回 undefined，两侧语义本就一致 |
| `get-pinia-stores` | `mockPiniaStores()`（L522 / L545） | |
| `get-pinia-state` | `mockPiniaState()`（L551 / L561） | |
| `update-pinia-state` | `mockUpdatePiniaState()`（L777） | 键不存在 throw 的语义与真实探针一致，统一走共享 catch |
| `get-network-records` | `mockNetworkRecords()`（L285） | |
| `clear-network-records` | `mockClearNetworkRecords()`（L304） | |
| `get-registered-routes` | 路由 fixtures（原 `mockRouterSnapshot().routes`，L649） | |
| `get-router-info` | mock `currentRoute`（L588 `router:snapshot` 整分支消失） | 共享回落逻辑（appId 兜底 / 首条路由兜底）对 mock 同样成立，结果等价 |
| `navigate-to` | 返回 `{ ok: true }`（L833 假成功） | |
| `open-in-editor` | throw（L817） | 统一走真实路径的 catch → `status:0` |
| `get-inspect-status` | 返回 `{ available: false }`（L482） | capabilities 查询由此变模式无关 |
| `recompute-component-state` | no-op（L857 分支消失） | version 递增 + 失效事件的共享逻辑保留在路由器 |

`MockBackend` 的方法分发用 `satisfies Record<ProbeMethod, Handler>`（或 switch + exhaustive
default throw）获得**编译期穷举检查**；未知方法运行时 throw
`mock 后端暂不支持 <method>`（fail loud，比现在"node 加方法 mock 静默漏跟"更可发现）。

**mock 状态管理语义（评审 P1-5）**：与现状一致，编辑类操作**直改模块级内存 fixtures**
（`stateById` / `piniaStateById` / `mockNetworkStore`）：

- 编辑在**同一面板会话内累积保持**（跨 tab 切换、跨断线重连均不丢——模块实例存活期间内存态不变）；
- **整页刷新后恢复初始 fixtures**（模块重新求值）。

评审场景的答案：`?mock` 下编辑 `foo: 1 → 2` → 切 tab 再切回，`foo === 2`；整页刷新后 `foo === 1`。
与真实链路的已知偏差：真实探针的编辑写进运行中的应用、面板刷新后重拉仍是新值；mock 刷新即丢。
这是 dev fixtures 的合理简化，记录在案即可，测试按此语义断言。

### 3.4 push 通道对照

| key | 真实实现 | mock 实现 |
| --- | --- | --- |
| `component-tree` | `sharedState('component-tree').on('updated')` → `applyTreeSnapshot` | `connect()` 后立即推一次 `mockComponentTree()` |
| `network-records` | `sharedState('network-records').on('updated')` → `handleNetworkSnapshot`（含格式校验） | 心跳推 `mockTickNetworkRecords()`，**包装成 `{ records, latestId, updatedAt }` 共享态形状** |

包装成共享态形状是有意为之：现在 mock 直接 `applyNetworkRecords` 绕过了
`validateNetworkSnapshot` 校验路径；统一后 **mock 也走同一套校验**，保真度提升。

**心跳可测试性（评审 P1-6）**：间隔可注入，不硬编码——

```ts
export interface MockBackendOptions {
  /** network 心跳间隔 ms；默认 1000，测试注入小值 + vi.useFakeTimers */
  networkTickInterval?: number
}
```

心跳定时器从 client 闭包（`mockTickTimer`，L207/L335/L921）移入 `MockBackend`，随 `dispose()` 清理。

### 3.5 连接生命周期（模式无关化后的 `initConnection`）

```ts
async function initConnection(): Promise<void> {
  backend = options.backend
    ?? (options.mock ? createMockBackend() : createDevframeBackend())
  await backend.connect(options.authToken)          // mock：立即 resolve；真实：连接 + socket 等待
  if (disposed) { backend.dispose(); return }       // 竞态检查点 1
  emitConnection('connected')
  unsubLost = backend.onConnectionLost(() => {      // mock 永不触发
    resetConnectionState()
    emitConnection('closed')
    scheduleReconnect()                             // 重连 = 重新 initConnection，新建 backend
  })
  // 订阅走两段式 ProbeSubscription（§3.2）：
  const treeSub = backend.subscribe('component-tree', applyTreeSnapshotPayload)
  void treeSub.ready.then(() => { if (disposed) treeSub.unsubscribe() }).catch(
    /* 建立失败：退化为主动拉取（现语义不变） */
  )
  const netSub = backend.subscribe('network-records', handleNetworkSnapshotPayload)
  void netSub.ready.then(() => { if (disposed) netSub.unsubscribe() }).catch(/* 同上 */)
}
```

- 两个 backend 的 `dispose()` 必须**幂等**，且在 `connect`/`subscribe` 未 settle 时调用也安全：
  `MockBackend` 在 dispose 后不再启动心跳、已启动的立即清除；`DevframeBackend` 在 dispose 后
  resolve 的连接立即 `client.close()`。
- `resetConnectionState()` / 顶层 `dispose()` 对所有拿到的 `ProbeSubscription` 调
  `unsubscribe()`（幂等，无需判断 settle 状态）。
- 真实路径的"等待 socket 真正 connected"、"sharedState 订阅失败退化为拉取"、
  失败错误文案 `无法连接 devframe 服务端（Uni DevTools 插件未启动？）` 全部原样保留在
  `DevframeBackend` 内。
- 与文件头现有生命周期注释一致：**每次连接新建 backend 实例，旧实例 dispose**，
  不做模块级单例。
- 文件尾 `if (!mockMode) void ensureReady()` 变为无条件自连——mock 的 `connect()` 是
  纯内存操作，自连零成本，行为不变。

---

## 4. 改动清单（按文件）

| 文件 | 动作 | 内容 |
| --- | --- | --- |
| `packages/adapter/src/backend.ts` | 新增 | `ProbeMethod` / `ProbePushKey` / `ProbeSubscription` / `ProbeBackend` 类型 |
| `packages/adapter/src/devframe-backend.ts` | 新增 | 真实实现：从 `initConnection` 抽出传输部分（connectDevframe、socket 等待、`connection:status` 监听、两个 sharedState 订阅）；dispose 幂等 |
| `packages/adapter/src/mock-backend.ts` | 新增 | fixtures 按方法名分发（`satisfies` 穷举）+ 路由 fixtures（吸收 `mockRouterSnapshot`）+ 可注人心跳 + push 包装；dispose 幂等 |
| `packages/adapter/src/uni-devtools-rpc.ts` | 修改 | 删 `mockMode`、`mockRouterSnapshot`、19 处分支；签名变 `connectUniRpcClient(options?: { mock?: boolean, authToken?: string, backend?: ProbeBackend })`（`backend` 供测试注入，优先于 `mock`）；`initConnection` 按 §3.5 重写 |
| `packages/adapter/src/index.ts` | 修改 | 删 `export * as fixtures` / `export *`（已确认无外部消费者）；导出 `ProbeBackend` 等类型 |
| `packages/adapter/src/mapping/*` | **不动** | 已核对零 mock 依赖（§2 非目标） |
| `packages/adapter/src/fixtures.ts` | 不动 | 纯数据，原样保留（`mockResetNetworkRecords` 当前无消费者，可顺手删或留待测试用） |
| `packages/client/src/composables/devtools-connection.ts` | 修改 | `getRpcClient()` 一行：`connectUniRpcClient({ mock: isMockPanelUrl() })` |
| `packages/client/src/main.ts` | 修改 | 角标改用 `isMockPanelUrl()`，删 `import { mockMode }` |

**`?mock` 参数解析的归属**：新增 3 行纯函数 `isMockPanelUrl()`（读 `location.search` 是否含
`mock`）放 `@uni-helper/devtools-shared`——参数名单一来源，connection 接线与角标共用；
adapter 自此**不读 URL、不碰 `window`**，mock 与否完全由调用方传入。这同时断掉了
client→adapter 的 mock 反向依赖（shared 是既有公共依赖，不引入新边）。

---

## 5. 行为对齐点（评审重点）

### 5.1 编辑命令错误路径（已核实的现存缺陷，行为修正）

统一后编辑分支共享 catch → 恒 resolve `{ status: 0, error: message }`。这是**行为修正**
而非单纯增强，依据以下事实链（评审 P0-2 要求的验证已完成）：

1. kit runtime dispatch（`@vue/devtools-kit@9.0.0-beta.0` dist `index.mjs` 的
   `async function command`）**不捕获** handler 抛错——`await handler(...) ?? { status: 1 }`
   只兜 undefined，抛错原样上抛；
2. 面板 `mutateComponentState`（`devtools-state.ts:255`）对 `client.command` 只有
   `finally` **没有 `catch`**：command resolve `{status:0}` 时 `assertCommandSucceeded`
   设置 `error.value`（UI 错误横幅）后抛出；command **reject** 时横幅不亮，清理仅靠 finally；
3. 现状 adapter 真实路径的 `components:editState` / `inspectors:editState` 中 `callUni`
   **无 catch** → 探针报错 = reject = **UI 无错误提示**；mock 路径返回 `{status:0}` = 有提示。
   两路展示不一致。

统一后测试冻结契约：脚本化 backend 在 `update-component-state` 上 throw → 编辑命令
resolve `{status:0, error: <原 message>}`，两模式展示一致（`formatCommandError` 对
string error 的处理两侧相同）。

### 5.2 其余对齐点

1. **`values:recompute`**：mock 原为"跳过 callUni 但仍发 version 失效事件"；统一后
   MockBackend no-op，version/emit 共享逻辑不变，行为等价。
2. **`router:snapshot` / `router:matchedRoutes`**：mock 从"整段早退"变为"共享回落逻辑跑
   mock 数据"。path→name 映射一致（`path.replace(/^\//, '')`），结果等价，用测试冻结。
3. **`devtools:capabilities`**：`openInEditor: !mockMode` → `backend.capabilities.openInEditor`；
   `inspect` 统一走 `get-inspect-status`（mock 返回 `{available:false}`），两个模式同一份代码。
4. **network 快照校验**：mock 推送改走 `handleNetworkSnapshot` → `validateNetworkSnapshot`
   （见 §3.4），是保真度增强。
5. **mock 编辑状态语义**：见 §3.3 末（内存态会话内保持、刷新重置），测试按此断言。

---

## 6. 测试计划

| 层 | 内容 |
| --- | --- |
| `test/mapping/*`（现有） | 冻结不动 |
| `test/mock-backend.test.ts`（新增） | 方法面逐个驱动：tree/state 形状、`update-component-state` 平铺键写回 + 深路径/remove NOT_SUPPORTED、`update-pinia-state` 未知键 throw、network 心跳 pending 结算（`networkTickInterval: 10` + `vi.useFakeTimers`，不真实等待）、clear、**未知方法 fail loud**、push 快照过 `validateNetworkSnapshot`、**编辑会话内保持/刷新重置语义**（§3.3） |
| `test/uni-devtools-rpc.test.ts`（新增/改造 tree.test.ts） | **注入脚本化 ProbeBackend**（不再 `vi.mock('devframe/client')`），冻结协议语义：appId 过滤、Pinia 聚合根、version 递增失效事件、订阅失败退化拉取 |
| 同上文件内：错误一致性用例 | backend.call throw → 编辑命令 resolve `{status:0, error}`（§5.1 契约），mock/真实两模式断言一致 |
| `test/lifecycle.test.ts`（新增） | dispose 竞态（评审 P0-1/P1-4）：`connect`/`subscribe` 挂起期间 `dispose()` → fake timers 下无存活定时器（心跳/重连均未泄漏）、不触发 `scheduleReconnect`、二次 dispose 幂等；`unsubscribe()` 在 ready 前调用安全 |
| `test/integration/mock-e2e.test.ts`（新增，adapter 级） | `connectUniRpcClient({ mock: true })` 全链路：五域 query → 数据形状；编辑 → 失效事件 version 递增；network 心跳推送驱动 `uniNetwork.subscribe` 监听者；openInEditor / 深路径编辑错误路径 |

**UI 级 E2E 的边界（评审 P2-8 部分采纳）**：评审建议的"完整 client + 角标 + 五域 tab"
E2E 不做 vitest 挂载——把官方面板整 UI 拉进 jsdom 成本高、断言脆，性价比低于现有
adapter 级集成测试 + 手工冒烟。角标与 tab 布局回归保留在手工清单：

手工验证：`?mock` 起面板（角标常驻、五域 tab、编辑交互、network 心跳可见 pending→结算）；
真实链路起 devframe 全功能回归。

---

## 7. 实施顺序（每步独立可合并、测试绿）

1. **抽接口**：新增 `backend.ts` + `devframe-backend.ts`，`uni-devtools-rpc.ts` 改面向接口。
   纯行为等同重构，mock 分支暂留，现有测试直接验证。
2. **落 mock**：新增 `mock-backend.ts`（逐条移植 §3.3 对照表）、`connectUniRpcClient` 选项化、
   `isMockPanelUrl()` 进 shared、接线 `devtools-connection.ts` + `main.ts`、删全部分支与
   `mockMode`。
3. **补测试**：§6 五个层级。
4. **（可选）bundle 卫生**：dynamic import 放在 `initConnection` **内部**（它本来就是 async）：

   ```ts
   const makeBackend = options.backend
     ? () => options.backend!
     : options.mock
       ? async () => (await import('./mock-backend.ts')).createMockBackend()
       : () => createDevframeBackend()
   ```

   `connectUniRpcClient` **保持同步签名**（评审担心的异步语义变化不存在，client 零配合）；
   Vite 把 mock-backend + fixtures 拆成独立 chunk，`?mock` 不出现则永不加载。
   记录产物体积前后对比（现状 fixtures 已无条件进 bundle，此项为纯优化非回归修复）。

---

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 漂移风险转移为"方法面漂移"（node 加方法 mock 未跟） | `ProbeMethod` 联合类型编译期穷举 + MockBackend 未知方法 fail loud（§3.3），测试枚举方法全表 |
| dispose 竞态（connect/subscribe 挂起期间调用） | `ProbeSubscription.unsubscribe()` 同步幂等（ready 前调用 = 标记待退订）；两个 backend `dispose()` 幂等且对未 settle 状态安全；每个 await 边界后复查 `disposed`；`test/lifecycle.test.ts` 冻结（§3.5、§6） |
| 编辑错误展示不一致（§5.1 现存缺陷回归或修不彻底） | 共享 catch 契约 + 错误一致性测试冻结 |
| 重连语义回归 | backend 实例随 `initConnection` 重建、旧实例 dispose，与现有"官方连接层 dispose 旧 client"的生命周期注释一致；tree.test.ts 的断线重连用例保持通过 |
| mock push 形状不满足校验导致面板空白 | §3.4 包装 + 测试显式断言过 `validateNetworkSnapshot` |
| bundle 体积（fixtures） | 现状已如此、非回归；Phase 4 可选摇掉 |
| 版本兼容（删 `mockMode` 导出的对外影响） | 已核实：client `private: true`、adapter 0.0.1 未发布（无 changesets / release 流程），二者同仓 `workspace:*` 锁定，**无独立升级场景**；未来若公开发布 adapter，需在 changelog 将本导出变更标注为 breaking |

## 9. 验收标准

- [ ] `uni-devtools-rpc.ts` 中 `mockMode` / `mockComponent*` / `mockPinia*` / `mockNetwork*` / `mockRouterSnapshot` 引用为 0
- [ ] `packages/client` 无 mock 语义 import（`grep -r "mock" packages/client/src` 仅剩角标自身逻辑）
- [ ] `pnpm --filter @uni-helper/devtools-adapter test` 全绿（含 §6 全部新增测试）
- [ ] `?mock` 手工冒烟：角标常驻、五域 tab（组件/状态编辑/Pinia/Network/路由）行为与改造前一致，编辑展示错误横幅路径可见
- [ ] 真实链路手工回归：连 devframe 服务端全功能正常，探针报错时编辑命令展示错误横幅（§5.1 修正生效）
- [ ] `test/mapping` 无 diff（冻结不破）
- [ ] Phase 4（若做）：记录 client 产物体积前后对比；mock chunk 未被默认入口引用

测量类指标不做硬门槛（评审建议的 ≤100ms 启动、Memory Profiler 手工步骤，降级为记录）：
mock `connect()` 是同步内存操作，定时器/订阅泄漏由 `test/lifecycle.test.ts`（fake timers）
程序化守护，比人工 Profiler 步骤更可重复。随 Phase 2 顺手补一段
`packages/adapter` 的 README mock 架构说明（当前该包无 README）。

## 10. 评审意见处置记录（v1.1）

| 评审点 | 处置 | 落点 / 理由 |
| --- | --- | --- |
| P0-1 subscribe 生命周期语义 | **采纳** | 两段式 `ProbeSubscription`，退订同步幂等、reject 后 no-op（§3.2、§3.5） |
| P0-2 真实路径错误一致性 | **采纳并升级定性** | 核实为现存缺陷：真实路径 reject 绕过 UI 错误横幅（§5.1 事实链），统一 catch 是行为修正；新增错误一致性测试（§6） |
| P0-3 mapping 是否依赖 mock | **已核实：零依赖** | 全量 grep 仅命中 `fixtures.ts` 与 `uni-devtools-rpc.ts`，`mapping/` 无需改动（§2、§4） |
| P1-4 dispose 竞态 | **采纳** | 幂等 dispose + await 边界检查点 + lifecycle 测试（§3.5、§8） |
| P1-5 mock 状态管理说明 | **采纳** | §3.3 末补充会话内保持/刷新重置语义，并回答评审场景 |
| P1-6 心跳可测试性 | **采纳** | `MockBackendOptions.networkTickInterval` + fake timers（§3.4、§6） |
| P2-7 方法名类型约束 | **部分采纳** | 取方案 A（字面量联合 + satisfies 穷举）；方案 B（全类型映射）不采纳，理由见 §3.2 |
| P2-8 集成测试 | **部分采纳** | 新增 adapter 级集成测试；UI 级 E2E（角标/tab）保留手工冒烟，理由见 §6 |
| P2-9 Phase 4 异步影响 | **采纳，给更优解** | dynamic import 移入 async 的 `initConnection` 内部，`connectUniRpcClient` 保持同步签名，client 零配合（§7） |
| Phase 4 需 client 配合的担忧 | **不成立** | 见上条，无需 client 侧异步化 |
| 升级/向下兼容路径 | **已核实：无场景** | client `private:true`、adapter 未发布、`workspace:*` 锁定；公开发布时 changelog 标 breaking（§8） |
| 验收补充：性能/内存硬指标 | **部分采纳** | 硬门槛降级为测量记录；内存泄漏由 lifecycle 测试程序化守护（§9） |
| 验收补充：README | **采纳（可选）** | Phase 2 顺手补 adapter README（§9） |

## 11. 实施记录（2026-10-06）

| Phase | 内容 | 验证 |
| --- | --- | --- |
| 1 | `backend.ts`（ProbeMethod / ProbeSubscription / ProbeBackend）+ `devframe-backend.ts`（连接生命周期、socket 等待、sharedState 订阅原样抽出）；路由器改面向接口，mock 分支暂留 | 现有 29 测试全绿、三包 typecheck 干净 |
| 2 | `mock-backend.ts`（方法面分发 + 路由 fixtures + 可注入心跳 + push 包装）；删除 `mockMode` / `mockRouterSnapshot` / 全部 19 处分支；`connectUniRpcClient(options)`；编辑命令统一 `try/catch → { status: 0 }`（§5.1）；`isMockPanelUrl()` 进 `devtools-shared`（子路径导出 `./utils/mock-flag`，globalThis 取 location 以过探针包的 `no-restricted-globals` 规则）；client 接线 + 角标解耦；adapter index 删 fixtures 双重导出 | adapter / shared / client typecheck 干净，验收 grep 全过（路由器仅注释性提及 fixtures，client 仅角标自身逻辑） |
| 3 | `test/mock-backend.test.ts`（10）、`test/uni-devtools-rpc.test.ts`（8，脚本化注入）、`test/lifecycle.test.ts`（5）、`test/integration/mock-e2e.test.ts`（5） | 8 文件 57 测试全绿 |
| 4 | mock-backend 改 `initConnection` 内 dynamic import，`connectUniRpcClient` 保持同步签名 | client 构建通过；`dist/assets/mock-backend-*.js` 独立 chunk 9.1 kB，主 chunk 中 fixtures 标记（`api.example.com` 等）为 0 |

两处与文档草图的实现偏差（均已在代码注释中就地说明）：

1. **`onConnectionLost` 细化为 `onConnectionStatus`**：真实链路的底层重连成功会再次发
   'connected'（connection 层 runtime-changed 语义依赖它），状态回调双向透传才能行为等同。
2. **`isMockPanelUrl` 用 `globalThis` 而非 `window`**：shared 包 tsconfig 无 DOM lib，
   且探针包对 shared 源码有 `no-restricted-globals: window/document/location` 规则。
