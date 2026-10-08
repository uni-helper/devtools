# 方案 D2 修正摘要

**修正版本**: 1.1  
**修正日期**: 2026-10-05  
**审阅人**: agy  
**审阅报告**: `/Users/mac/.seedmux/team/tasks/T-fcfa2e/review.md`

---

## 修正项清单

### ✅ 严重问题修正（2 项）

#### 1. 定时器清理未接入 `instance.dispose` ✓

**问题**：`setupChangeDetectionHooks` 返回清理函数，但 `instance.dispose()` 未调用；`changeHooksInstalled = false` 导致全局事件总线重复注册。

**修正方案**：

- 拆分钩子管理：
  - `processGlobalHooksInstalled`（进程级，永不重置）→ `ensureProcessGlobalHooks()`
  - `snapshotPollingTimer`（实例级）→ `startSnapshotPolling()` / `stopSnapshotPolling()`
- `instance.dispose()` 显式调用 `stopSnapshotPolling()`
- 删除 `changeHooksInstalled = false`（避免重复注册）

**修正位置**：

- `REFACTOR_PLAN_D2.md` 第 2.2 节 `lifecycle.ts`（第 260-420 行）

---

#### 2. CI 检查脚本假阳性误报 ✓

**问题**：`grep -qi "pinia\|toRaw\|isRef"` 会误命中 `serialize.ts` 的 `vueAny.toRaw` 属性访问（字符串形式），导致 CI 100% 误报。

**修正方案**：

- 只检查 `pinia`：`grep -qi "pinia" dist/agent-vue2.mjs`
- 删除对 `toRaw`/`isRef` 的检查（作为属性名是安全的）

**修正位置**：

- 第 3.5 节（第 712-720 行）
- 第 4.2 节（第 750-762 行）
- 第 5 节打包验收（第 825 行）

---

### ✅ 一般问题修正（3 项）

#### 3. `rpc-base.ts` 缺少类型 import ✓

**问题**：返回类型声明引用了 5 个接口类型，但未导入。

**修正方案**：

```typescript
import type { PageComponentTree } from './tree'
import type { ComponentStateResult, UpdateStateResult } from './state'
import type {
  ClearNetworkRecordsResult,
  GetNetworkRecordsResult,
} from '../types'
```

**修正位置**：第 2.1 节（第 74-79 行）

---

#### 4. `index.ts` 重导出语法错误 ✓

**问题**：错误地将所有函数从 `./tree` 导出，导致 `createUniSocketChannel` 等找不到。

**修正方案**：

```typescript
export {
  collectComponentTree,
  getRegisteredInstance,
  getVueRuntimeVersion,
} from './tree'
export { createUniSocketChannel } from './socket'
export { pushComponentTreeNow, schedulePushComponentTree } from './push'
export {
  getComponentState,
  updateComponentState,
  recomputeComponentState,
} from './state'
export { getPiniaState, getPiniaStores, updatePiniaState } from './pinia'
export {
  clearNetworkRecords,
  getNetworkRecords,
  installNetworkInterceptors,
  resetNetworkPushState,
  scheduleNetworkPush,
} from './network'
```

**修正位置**：第 2.3 节（第 533-541 行）

---

#### 5. `lifecycle.ts` 引用不存在的 `./types` ✓

**问题**：`import type { AgentConfig, AgentInstance } from './types'`，但 `types.ts` 不存在。

**修正方案**：

- 在 `lifecycle.ts` 中直接定义并导出 `AgentConfig` 和 `AgentInstance` 接口
- `index.ts` 和 `vue2.ts` 从 `./lifecycle` 导入类型

**修正位置**：

- 第 2.2 节（第 236-251 行）
- 第 2.3 节（第 493 行）
- 第 2.4 节（第 573 行）

---

### ✅ 建议改进（1 项）

#### 6. 恢复 WebSocket 诊断日志 ✓

**问题**：丢失了刚修复的 `onOpen`/`onError` 日志输出。

**修正方案**：

```typescript
createUniSocketChannel({
  /* eslint-disable no-console */
  onOpen: () => {
    console.log(
      '[uni-devtools-agent] DevTools connected, pushing initial state',
    )
    // ...
  },
  onError: (err) => {
    console.error('[uni-devtools-agent] Socket error:', err)
  },
  /* eslint-enable no-console */
})
```

**修正位置**：第 2.2 节（第 371-383 行）

---

### ✅ 补充验证点（3 项）

#### 7. 跨版本实例隔离测试 ✓

**内容**：验证 Vue 2 实例不包含 Vue 3 专属方法，单例状态重置无残留。

**修正位置**：第 8.1 节（新增，第 907-950 行）

---

#### 8. 多轮初始化监听器计数验证 ✓

**内容**：验证快照轮询定时器始终维持 0 或 1 个，全局事件监听器不重复注册。

**修正位置**：第 8.2 节（新增，第 952-1010 行）

---

#### 9. 真实 Webpack 4 + Vue 2.6 构建验证 ✓

**内容**：在 `spike/uni-vue2-webpack` 中真机测试打包产物。

**修正位置**：第 8.3 节（新增，第 1012-1052 行）

---

## 修正前后对比

| 维度             | 修正前                               | 修正后                           |
| ---------------- | ------------------------------------ | -------------------------------- |
| **定时器清理**   | ⚠️ 未接入 `instance.dispose`         | ✅ 完整闭环清理                  |
| **全局钩子管理** | ⚠️ 重复注册风险                      | ✅ 进程级单次注册 + 实例级定时器 |
| **CI 检查**      | ❌ 100% 误报（检查 `toRaw`/`isRef`） | ✅ 只检查 `pinia`                |
| **类型 import**  | ❌ 缺失 5 个类型                     | ✅ 完整导入                      |
| **重导出语法**   | ❌ 全从 `./tree` 导出                | ✅ 按实际模块分别导出            |
| **类型定义位置** | ❌ 引用不存在的 `./types`            | ✅ 在 `lifecycle.ts` 中定义      |
| **诊断日志**     | ⚠️ 缺失 `onError`                    | ✅ 完整恢复                      |
| **补充验证**     | ⚠️ 未覆盖                            | ✅ 3 项关键测试场景              |

---

## 验收状态

- [x] 所有严重问题已修正（2/2）
- [x] 所有一般问题已修正（3/3）
- [x] 建议改进已采纳（1/1）
- [x] 补充验证点已添加（3/3）

**总结**：方案 D2 版本 1.1 已完成全部修正，可以开始实施。
