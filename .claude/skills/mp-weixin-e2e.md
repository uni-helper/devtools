---
name: mp-weixin-e2e
description: Use when E2E-testing the uni-devtools mp-weixin integration in this repo — driving the WeChat DevTools simulator, switching rendered components/tabs, and verifying the probe component tree for dead instances, duplicate IDs, or leaks after probe/adapter changes. Triggers: mp-weixin E2E, 小程序组件树, KeepAlive, dead instance, duplicate IDs, devtools 探针回归.
---

# MP-Weixin E2E Testing

Automate WeChat MiniProgram testing with IDE control and component tree verification.

## When to use

- E2E testing for mp-weixin devtools integration
- Verify component tree correctness after interactions (tab switch, navigation, KeepAlive)
- Detect dead instances, duplicate IDs, or component leaks
- Regression testing for probe/devframe changes

## Quick start

The recommended path is `scripts/e2e.js` (repo root) — it wraps the whole workflow below:

```bash
# 脚本自己起 pnpm dev:mp-weixin、解析 token、拉起 IDE、跑全部场景
node scripts/e2e.js --build

# 构建已在跑时手动指定 sidecar（token 来自 dev:mp-weixin 日志）
node scripts/e2e.js --base-url http://localhost:<port>/__uni-devtools/ --token <token>

# 只跑部分场景；chaos 可用 --seed 复现
node scripts/e2e.js --build --scenarios baseline,tab-switch,rapid-switch
node scripts/e2e.js --build --scenarios chaos --seed 20261008
```

场景通过标准（脚本自动断言）：

1. 中继快照（`get-component-tree`）无重复节点 id
2. 中继快照节点数 === 模拟器内核按探针同款规则遍历的存活节点数（两者不一致 = 死实例泄漏或遍历规则漂移）
3. 回到「全部组件」Tab 后组件总数恢复基线、TestComp 恒为 1

注意：内核 `$children` 链上的**死实例滞留是预期行为**（uni-mp-vue 卸载从不清链，脚本输出 `kernelChain`/`deadInChain` 仅作信息），探针负责过滤——不要把 raw 链的 dead>0 当作失败。

失败时脚本会把中继快照 + 内核遍历存到 `scripts/e2e-artifacts/`，先对比 `packages/probes/src/runtime/tree.ts` 的过滤逻辑。

## Prerequisites

- macOS + WeChat DevTools installed at `/Applications/wechatwebdevtools.app`（其他平台 CLI 路径不同，未适配）
- `miniprogram-automator`：已是 workspace devDependency（`pnpm add -w -D miniprogram-automator` 可补装；不要 npm -g，ESM import 解析不到全局包）
- Service port enabled in IDE (Settings → Security → Service Port)；未开启时 `cli auto` 会交互式询问，脚本自动回 `y`（这是在确认开启 IDE 服务端口，供 CLI/automator 调用）

## Manual workflow（脚本内部的原理，调试时用）

### Setup

1. **Start build watcher**（在 `playground/vue3-vite/` 下）:

```bash
pnpm dev:mp-weixin
```

Outputs to `dist/dev/mp-weixin` and starts sidecar server. Note the panel URL and token (`devframe_auth_token=`).

2. **Clean and launch IDE**:

```bash
pkill -f wechatdevtools   # 僵死实例（connect 成功但 currentPage 无响应）先杀
echo "y" | /Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project $(pwd)/playground/vue3-vite/dist/dev/mp-weixin \
  --auto-port 9420
```

Wait for "IDE server started successfully"（轮询 `lsof -i :9420` 即可）。

3. **Connect automator**：

```javascript
const automator = require('miniprogram-automator')

const miniProgram = await automator.connect({
  wsEndpoint: 'ws://localhost:9420',
})

const page = await miniProgram.currentPage()
// eslint-disable-next-line no-console
console.log('Connected to:', page.path)
```

**端口在监听 ≠ 模拟器就绪**：首次编译完成前 connect 会抛内部错误或 currentPage 无响应，轮询重试（脚本等 90s）而不是立刻放弃。

### Drive interactions

Mini-program compiles `bindtap="handleName"` into `vm.$.ctx.$scope.eX_NAME.value()`（真正的处理函数挂在 invoker 的 `.value` 上；直接调 `scope.eX(evt)` 会因 bubbles 分支走 setTimeout 而不确定）。

```javascript
// List available handlers（语义后缀对应 index 页 Tab id）
const handlers = await miniProgram.evaluate(() => {
  const scope = getCurrentPages()[0].$vm.$.ctx.$scope
  return Object.keys(scope).filter((k) => /^e\d+_/.test(k))
})

// Trigger: switch to LEGACY tab
await miniProgram.evaluate(() => {
  getCurrentPages()[0].$vm.$.ctx.$scope.e8_LEGACY.value()
})
await new Promise((resolve) => setTimeout(resolve, 500)) // Wait for render
```

Handler 名以编译产物为准：`playground/vue3-vite/dist/dev/mp-weixin/pages/index.wxml`。

### Verify component tree

内核侧遍历（mp 下 `subTree` 为空，`ctx.$children` 是唯一路径）：

```javascript
const snapshot = await miniProgram.evaluate(() => {
  function traverse(vm, depth = 0, visited = new Set()) {
    if (!vm || depth >= 10 || visited.has(vm)) return []
    visited.add(vm)
    const internal = vm.$ || vm // Vue3 内部实例
    const t = internal.type
    const name = (t && (t.__name || t.name)) || vm.$options?.name || 'Anonymous'
    const isDead = !!(internal.isUnmounted || internal._isDestroyed)
    if (isDead) return [] // 探针同款：死实例及其子树剪掉
    const nodes = [{ name, uid: internal.uid ?? internal._uid, depth }]
    const kids = (internal.ctx && internal.ctx.$children) || []
    for (const child of kids) nodes.push(...traverse(child, depth + 1, visited))
    return nodes
  }
  return traverse(getCurrentPages()[0].$vm)
})
```

**Expected**: 同页内无重复 uid；组件数与中继快照一致。

中继侧快照（面板真正消费的数据）不要手写裸 WebSocket——协议是 devframe 的（`__connection.json` 握手 + birpc），直接用仓库依赖：

```javascript
import { connectDevframe } from 'devframe/client'
// node 下需先补 globalThis.location/window（client 面向浏览器）
const client = await connectDevframe({
  baseURL,
  authToken: token,
  simpleAuth: false,
  otpParam: false,
})
const scoped = client.scope('uni-helper-devtools')
const tree = await scoped.rpc.call('get-component-tree')
```

推送有防抖 + 内容门：连续两次快照一致才算稳定（脚本已实现）。

## Test scenarios

`scripts/e2e.js --scenarios` 内置：baseline / tab-switch / rapid-switch（<200ms 间隔）/ navigation / keepalive（best-effort）/ chaos（固定种子可复现）。手跑时按同一顺序，每步之后验证：

- 中继快照无重复 ID、节点数与内核存活遍历一致
- 组件数恢复基线

## Debugging

### IDE connection fails / 模拟器无响应

- Kill all: `pkill -f wechatdevtools`，等 4s 再 `cli auto` 重拉
- Check port: `lsof -i :9420`
- Enable service port in IDE: Settings → Security → Service Port
- `cli auto` 报 `wait IDE port timeout`：旧 IDE 实例残留，pkill 后重来

### evaluate() returns undefined / 报错

- Return value must be JSON-serializable
- Check IDE Debug panel console for errors

### Empty $children

- `vm.$.ctx.$children` is the only traversal path in mp-weixin（`subTree` 为空）
- If undefined, component has no children (this is correct)

### Changes not taking effect

- 构建 watcher 不监听 workspace 源码：`touch playground/vue3-vite/src/main.ts` 触发重构建
- Verify fix in: `playground/vue3-vite/dist/dev/mp-weixin/common/vendor.js`
- Wait for simulator auto-reload or click "Recompile"

### pnpm 找不到 dev:mp-weixin 脚本

- 确认 cwd 在 `playground/vue3-vite/`（顶层 `playground/` 只是容器，没有 scripts）
- spawn 时显式传 cwd，不要依赖 shell 状态

## Key files

- `scripts/e2e.js` - 全流程自动化脚本（推荐入口）
- `packages/probes/src/runtime/tree.ts` - Component tree traversal（死实例过滤在这里）
- `packages/vite/src/index.ts` - Virtual module injection
- `playground/vue3-vite/dist/dev/mp-weixin/pages/index.wxml` - Compiled template with handler names
- `playground/vue3-vite/dist/dev/mp-weixin/common/vendor.js` - Bundled output to verify fixes
