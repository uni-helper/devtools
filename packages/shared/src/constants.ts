/**
 * 跨环境冻结契约常量（node 侧 ↔ mp 探针端共享）。
 *
 * 本文件必须保持**零 import**：它会同时进入 node 侧（core / vite / webpack，esbuild
 * bundle）与小程序构建（probes，uni-app vite 构建）——任何依赖都可能破坏其中一侧
 * （例：拖入 node:path 会炸 mp 构建）。
 * 此前这些字面量在写端与读端各自复制三份、靠注释约定同步；收敛到这里后
 * 「多处同步」变成「一处事实」。
 */

/** 编译期插桩挂在 setup 返回的 render 函数上的闭包绑定属性名（instrument.ts 写入 ↔ 探针读取） */
export const BINDINGS_PROP = '__uni_devtools_bindings__'

/**
 * Vue 2/3 **通用**的 8 个探针方法（`probes` 的 runtime/rpc-base.ts 消费）。
 *
 * 与 `AGENT_RPC_VUE3` 分成两张**扁平**表是有意的，也不是冗余：
 *
 * 1. 语义上「通用 / Vue 3 专属」本来就是两条运行时线的真实分界。
 * 2. 打包上，Vue 2 线吃的是预构建产物 `agent-vue2.mjs`，而「零 Vue 3 污染」的
 *    验收判据是一条 `grep -ci pinia`。**不要再导出一张 `{ ...BASE, ...VUE3 }`
 *    的合并表**——对象展开会让 esbuild 无法证明初始化无副作用，从而把整块
 *    （含 Pinia 键名）保留进 Vue 2 产物，让那条判据变成恒假阳性，真问题反被
 *    淹没。需要全表的是 node 侧，由 `core/src/rpc-names.ts` 自行组装。
 */
export const AGENT_BASE_RPC = {
  ping: 'uni-devtools:agent:ping',
  getComponentTree: 'uni-devtools:agent:getComponentTree',
  getComponentState: 'uni-devtools:agent:getComponentState',
  updateComponentState: 'uni-devtools:agent:updateComponentState',
  getNetworkRecords: 'uni-devtools:agent:getNetworkRecords',
  clearNetworkRecords: 'uni-devtools:agent:clearNetworkRecords',
  getRouterInfo: 'uni-devtools:agent:getRouterInfo',
  navigate: 'uni-devtools:agent:navigate',
} as const

/**
 * Vue 3 专属的 5 个探针方法（`probes` 的 vue3 入口消费）。
 * 不要下沉进 `AGENT_BASE_RPC`——理由见上。
 */
export const AGENT_RPC_VUE3 = {
  recomputeComponentState: 'uni-devtools:agent:recomputeComponentState',
  getComponentRenderCode: 'uni-devtools:agent:getComponentRenderCode',
  getPiniaStores: 'uni-devtools:agent:getPiniaStores',
  getPiniaState: 'uni-devtools:agent:getPiniaState',
  updatePiniaState: 'uni-devtools:agent:updatePiniaState',
} as const

/**
 * 探针 → node 的主动推送方法名：探针 `$call` ↔ node 侧 `uni.rpc.register`。
 * 与上面两张表方向相反，但同样是两端冻结契约。
 */
export const NODE_RPC = {
  pushComponentTree: 'uni-helper-devtools:push-component-tree',
  pushNetworkRecords: 'uni-helper-devtools:push-network-records',
  /**
   * 渲染钩子上报「哪些组件重渲染了」。
   *
   * 树推送有内容门，setup 值变化不改树结构、会被门挡住——面板因此看不到端上的
   * 改动。这条通道不比对内容，只报 id，node 侧原样转发；「是否面板正在看的
   * 组件」由 adapter 判断（只有它知道面板选中态，探针与 node 都不知道）。
   */
  notifyComponentRendered: 'uni-helper-devtools:notify-component-rendered',
} as const
