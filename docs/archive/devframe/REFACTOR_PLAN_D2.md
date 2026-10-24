# Vue 2/3 双版本 Agent 架构重构方案 D2

**状态**: 待实施  
**版本**: 1.1（根据 agy 审阅意见修正）  
**日期**: 2026-10-05  
**讨论记录**: `/Users/mac/.seedmux/team/discussions/D-681430/`  
**审阅报告**: `/Users/mac/.seedmux/team/tasks/T-fcfa2e/review.md`

---

## 执行摘要

将 `packages/devframe/src/agent/index.ts` (Vue 3, 317行) 和 `agent/vue2.ts` (Vue 2, 288行) 中约 80% 的重复代码抽取为 2 个共享核心文件，同时修复定时器内存泄漏缺陷。重构后两个入口各缩减至 25-35 行，代码总量从 606 行降至约 260-290 行，净减少 43%-56%。

**核心收益**：

- ✅ 消除 80% 代码重复（约 230 行）
- ✅ 修复 `setInterval` 内存泄漏缺陷
- ✅ 保持 TypeScript 静态类型安全（强类型 Object Spread）
- ✅ 物理隔离 Vue 2/3 依赖（打包零污染）
- ✅ 现有 136 项单元测试 100% 兼容
- ✅ 向后兼容所有导出 API

---

## 一、方案概览

### 1.1 目录结构变更

```diff
src/agent/
+ ├── rpc-base.ts          # 新增：8 个基础 RPC 方法 + 环境工具（~100 行）
+ ├── lifecycle.ts         # 新增：生命周期管道 + 单例管理 + 定时器清理（~100 行）
  ├── index.ts             # 重构：Vue 3 入口（317 → ~30 行）
  ├── vue2.ts              # 重构：Vue 2 入口（288 → ~25 行）
  ├── socket.ts            # 保持不变
  ├── tree.ts              # 保持不变
  ├── state.ts             # 保持不变
  ├── network.ts           # 保持不变
  ├── push.ts              # 保持不变
  ├── navigate.ts          # 保持不变
  ├── pinia.ts             # 保持不变（仅 Vue 3 引用）
  ├── render-code.ts       # 保持不变（仅 Vue 3 引用）
  └── ...                  # 其他文件保持不变
```

### 1.2 代码量对比

| 模块           | 当前行数 | 重构后行数 | 变化            |
| -------------- | -------- | ---------- | --------------- |
| `index.ts`     | 317      | ~30        | -287            |
| `vue2.ts`      | 288      | ~25        | -263            |
| `rpc-base.ts`  | 0        | ~100       | +100            |
| `lifecycle.ts` | 0        | ~100       | +100            |
| **总计**       | **605**  | **~255**   | **-350 (-58%)** |

### 1.3 核心设计原则

1. **物理隔离优先**：Vue 2 入口零 import Vue 3 专属模块（`pinia.ts`、`render-code.ts`）
2. **强类型 Object Spread**：`{...createBaseRpcFunctions(), ...vue3Methods}` 保持 TypeScript 类型推导
3. **统一生命周期管理**：单例状态、定时器清理、初始化时序集中在 `lifecycle.ts`
4. **最小化修改面**：底层模块（`tree.ts`、`state.ts`、`network.ts` 等）完全不动

---

## 二、详细设计

### 2.1 `rpc-base.ts` - 基础 RPC 方法集合

**职责**：

- 提供 8 个 Vue 2/3 通用的 RPC 方法
- 提供环境探测工具函数（`getCurrentPagesSafe`、`resolveRuntimeUni`）

**关键代码框架**：

```typescript
import type { PageComponentTree } from './tree'
import type { ComponentStateResult, UpdateStateResult } from './state'
import type {
  ClearNetworkRecordsResult,
  GetNetworkRecordsResult,
} from '../types'
import { collectComponentTree, getVueRuntimeVersion } from './tree'
import { getComponentState, updateComponentState } from './state'
import { getNetworkRecords, clearNetworkRecords } from './network'
import { schedulePushComponentTree } from './push'
import { navigateInMiniProgram } from './navigate'

/** 安全读取当前页面栈（mp 全局 getCurrentPages 可能不存在或抛错） */
export function getCurrentPagesSafe(): any[] {
  const getPages =
    typeof getCurrentPages === 'function'
      ? getCurrentPages
      : typeof globalThis !== 'undefined' &&
          typeof (globalThis as any).getCurrentPages === 'function'
        ? (globalThis as any).getCurrentPages
        : undefined
  try {
    const pages = getPages ? getPages() : []
    return Array.isArray(pages) ? pages : []
  } catch {
    return []
  }
}

/** 安全解析全局 uni 或 wx 运行时 */
export function resolveRuntimeUni(runtimeHint?: any): any {
  if (runtimeHint) return runtimeHint
  if (typeof uni !== 'undefined') return uni
  if (typeof globalThis !== 'undefined' && (globalThis as any).uni)
    return (globalThis as any).uni
  if (typeof wx !== 'undefined') return wx
  if (typeof globalThis !== 'undefined' && (globalThis as any).wx)
    return (globalThis as any).wx
  return undefined
}

/**
 * 创建 8 个基础 RPC 方法（Vue 2/3 通用）
 *
 * 返回类型显式声明，确保 TypeScript 完整推导每个方法的签名
 */
export function createBaseRpcFunctions(): {
  'uni-devtools:agent:ping': () => number
  'uni-devtools:agent:getComponentTree': () => {
    pages: PageComponentTree[]
    vueVersion?: string
  }
  'uni-devtools:agent:getNetworkRecords': (
    params?: any,
  ) => GetNetworkRecordsResult
  'uni-devtools:agent:clearNetworkRecords': () => ClearNetworkRecordsResult
  'uni-devtools:agent:getComponentState': (
    params: { id: string } | string,
  ) => ComponentStateResult
  'uni-devtools:agent:updateComponentState': (
    params: any,
    maybeKey?: string,
    maybeVal?: unknown,
  ) => UpdateStateResult
  'uni-devtools:agent:getRouterInfo': () => {
    currentRoute: {
      path: string
      fullPath?: string
      query?: Record<string, unknown>
    } | null
    stack: Array<{
      path: string
      query?: Record<string, unknown>
      options?: Record<string, unknown>
    }>
  }
  'uni-devtools:agent:navigate': (params: {
    path: string
  }) => Promise<{ ok: boolean; error?: string }>
} {
  return {
    'uni-devtools:agent:ping': (): number => {
      return Date.now()
    },

    'uni-devtools:agent:getComponentTree': () => {
      return {
        pages: collectComponentTree(),
        vueVersion: getVueRuntimeVersion(),
      }
    },

    'uni-devtools:agent:getNetworkRecords': (params?: any) => {
      return getNetworkRecords(params)
    },

    'uni-devtools:agent:clearNetworkRecords': () => {
      return clearNetworkRecords()
    },

    'uni-devtools:agent:getComponentState': (
      params: { id: string } | string,
    ) => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentState(id)
    },

    'uni-devtools:agent:updateComponentState': (
      params: any,
      maybeKey?: string,
      maybeVal?: unknown,
    ) => {
      const res =
        typeof params === 'object' && params !== null && 'id' in params
          ? updateComponentState(params)
          : updateComponentState({
              id: params,
              key: maybeKey!,
              value: maybeVal,
            })
      schedulePushComponentTree(100)
      return res
    },

    'uni-devtools:agent:getRouterInfo': () => {
      const pages = getCurrentPagesSafe()
      const stack = pages.map((page: any) => {
        const rawRoute = page?.route || page?.__route__ || ''
        const path = rawRoute
          ? rawRoute.startsWith('/')
            ? rawRoute
            : `/${rawRoute}`
          : '/'
        const query = page?.options || page?.$page?.options || {}
        return {
          path,
          query,
          options: query,
        }
      })

      const top = stack[stack.length - 1]
      const currentRoute = top
        ? {
            path: top.path,
            fullPath: top.path,
            query: top.query,
          }
        : null

      return {
        currentRoute,
        stack,
      }
    },

    'uni-devtools:agent:navigate': (params: { path: string }) => {
      const url = params?.path
      if (!url) {
        return Promise.resolve({ ok: false, error: 'Path is required' })
      }
      const uniObj = resolveRuntimeUni()
      if (!uniObj) {
        return Promise.resolve({
          ok: false,
          error: 'uni runtime is not available',
        })
      }

      return navigateInMiniProgram(uniObj, url, getCurrentPagesSafe)
    },
  }
}
```

**关键设计点**：

- ✅ 返回类型显式声明（不依赖自动推导），保证 TypeScript 完整类型检查
- ✅ 所有依赖的底层模块（`tree.ts`、`state.ts`、`network.ts`、`navigate.ts`）均为 Vue 2/3 共享模块
- ✅ 零引用 Vue 3 专属模块（`pinia.ts`、`render-code.ts`）

---

### 2.2 `lifecycle.ts` - 生命周期管道与单例管理

**职责**：

- 统一管理 `activeAgentInstance` 单例状态
- 按严格时序执行 Agent 初始化管道（Socket → RPC → bindPushDeps → installNetworkInterceptors → resetGates → setupChangeDetectionHooks）
- 提供带清理句柄的变更检测钩子（修复 `setInterval` 泄漏）
- 集中清理逻辑（`disposeAgent`）

**关键代码框架**：

```typescript
import { createRpcClient } from 'devframe/rpc/client'
import { config } from 'virtual:uni-devtools-agent'
import { type UniSocketChannelHandle, createUniSocketChannel } from './socket'
import {
  bindPushDeps,
  cancelScheduledPush,
  resetPushGate,
  schedulePushComponentTree,
} from './push'
import { collectComponentTree } from './tree'
import {
  cancelScheduledNetworkPush,
  installNetworkInterceptors,
  resetNetworkPushState,
  scheduleNetworkPush,
} from './network'

declare const wx: any
declare const uni: any
declare const getCurrentPages: any

/**
 * Agent 配置接口
 */
export interface AgentConfig {
  wsUrl: string
  token: string
}

/**
 * Agent 实例接口
 */
export interface AgentInstance {
  rpc: any
  socketHandle: UniSocketChannelHandle
  dispose: () => void
}

/** 模块级单例状态（由 lifecycle.ts 统一持有） */
let activeAgentInstance: AgentInstance | null = null

/**
 * 进程级全局事件钩子（只安装一次，永不重复安装）
 *
 * 包括：wx.onAppRoute、uni.addInterceptor、__VUE_DEVTOOLS_GLOBAL_HOOK__
 * 这些是宿主运行时的全局单例事件总线，不应随 Agent 实例销毁而重复注册
 */
let processGlobalHooksInstalled = false

function ensureProcessGlobalHooks(): void {
  if (processGlobalHooksInstalled) {
    return
  }
  processGlobalHooksInstalled = true

  // 小程序原生页面路由事件（wx 全局，仅微信系可用）
  if (typeof wx !== 'undefined' && typeof wx.onAppRoute === 'function') {
    try {
      wx.onAppRoute(() => {
        schedulePushComponentTree(200)
      })
    } catch {}
  }

  // uni 路由跳转拦截（涵盖 navigateTo / redirectTo / switchTab / navigateBack / reLaunch）
  const uniObj = typeof uni !== 'undefined' ? uni : (globalThis as any).uni
  if (uniObj && typeof uniObj.addInterceptor === 'function') {
    const routeMethods = [
      'navigateTo',
      'redirectTo',
      'reLaunch',
      'switchTab',
      'navigateBack',
    ]
    for (const method of routeMethods) {
      try {
        uniObj.addInterceptor(method, {
          complete() {
            schedulePushComponentTree(250)
          },
        })
      } catch {}
    }
  }

  // Vue DevTools 全局钩子接入（组件 mount/update 时触发）
  try {
    const globalObj = globalThis as any
    const existingHook = globalObj.__VUE_DEVTOOLS_GLOBAL_HOOK__
    if (existingHook && typeof existingHook.on === 'function') {
      existingHook.on('component:added', () => schedulePushComponentTree(300))
      existingHook.on('component:updated', () => schedulePushComponentTree(300))
      existingHook.on('component:removed', () => schedulePushComponentTree(300))
    }
  } catch {}
}

/**
 * 实例级快照轮询定时器（随 Agent 实例生命周期启停）
 *
 * 快照轮询是兜底机制：uni 的 mp 构建里 __VUE_DEVTOOLS_GLOBAL_HOOK__ 通常不存在，
 * 「小程序里改 data」没有任何事件可听——这恰恰是用户最高频的场景。
 */
let snapshotPollingTimer: any = null

function startSnapshotPolling(): void {
  if (snapshotPollingTimer !== null) {
    return // 已启动，避免重复
  }

  let lastSnapshot = ''
  snapshotPollingTimer = setInterval(() => {
    try {
      const snapshot = JSON.stringify({ pages: collectComponentTree() })
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot
        schedulePushComponentTree(0)
      }
    } catch {}
  }, 2000)
}

function stopSnapshotPolling(): void {
  if (snapshotPollingTimer !== null) {
    clearInterval(snapshotPollingTimer)
    snapshotPollingTimer = null
  }
}

/**
 * Agent 初始化管道（严格按 6 步时序执行）
 *
 * @param options.clientFunctions - RPC 方法字典（由入口组装，包含版本专属方法）
 * @param options.customConfig - 自定义配置（wsUrl、token 等）
 * @param options.getUni - 运行时 uni 对象获取器（用于网络拦截器）
 */
export function initAgentPipeline(options: {
  clientFunctions: Record<string, any>
  customConfig?: Partial<AgentConfig>
  getUni: () => any
}): AgentInstance {
  // 单例防重复初始化
  if (activeAgentInstance) {
    return activeAgentInstance
  }

  const effectiveConfig: AgentConfig = {
    wsUrl: options.customConfig?.wsUrl || config?.wsUrl || '',
    token: options.customConfig?.token || config?.token || '',
  }

  if (!effectiveConfig.wsUrl) {
    throw new Error('[uni-devtools-agent] wsUrl is missing from configuration')
  }

  const separator = effectiveConfig.wsUrl.includes('?') ? '&' : '?'
  let fullWsUrl = effectiveConfig.token
    ? `${effectiveConfig.wsUrl}${separator}devframe_auth_token=${encodeURIComponent(effectiveConfig.token)}`
    : effectiveConfig.wsUrl

  // 携带探针标记（供 node 侧 relay AgentRegistry 识别定向连接）
  if (!fullWsUrl.includes('client=uni-agent')) {
    fullWsUrl += `${fullWsUrl.includes('?') ? '&' : '?'}client=uni-agent`
  }

  // === 步骤 1：创建 WebSocket 通道 ===
  const socketHandle = createUniSocketChannel({
    wsUrl: fullWsUrl,
    /* eslint-disable no-console */
    onOpen: () => {
      console.log(
        '[uni-devtools-agent] DevTools connected, pushing initial state',
      )
      schedulePushComponentTree(100)
      resetNetworkPushState()
      scheduleNetworkPush(100)
    },
    onError: (err) => {
      console.error('[uni-devtools-agent] Socket error:', err)
    },
    /* eslint-enable no-console */
  })

  // === 步骤 2：创建 RPC Client ===
  const rpc = createRpcClient(options.clientFunctions, {
    channel: socketHandle.channel,
  })

  // === 步骤 3：绑定推送依赖 ===
  bindPushDeps({ getActiveInstance: () => activeAgentInstance })

  // === 步骤 4：安装网络拦截器 ===
  installNetworkInterceptors({
    getActiveInstance: () => activeAgentInstance,
    getUni: options.getUni,
  })

  // === 步骤 5：重置推送门与网络状态门 ===
  resetPushGate()
  resetNetworkPushState()

  // === 步骤 6A：安装进程级全局事件钩子（只执行一次） ===
  ensureProcessGlobalHooks()

  // === 步骤 6B：启动实例级快照轮询定时器 ===
  startSnapshotPolling()

  // === 构造实例并持有单例 ===
  const instance: AgentInstance = {
    rpc,
    socketHandle,
    dispose: () => {
      stopSnapshotPolling() // ✅ 清理快照轮询定时器
      socketHandle.dispose()
      if (activeAgentInstance === instance) {
        activeAgentInstance = null
      }
    },
  }

  activeAgentInstance = instance
  return instance
}

/**
 * 获取当前活跃的 Agent 实例
 */
export function getAgentInstance(): AgentInstance | null {
  return activeAgentInstance
}

/**
 * 清理并销毁当前 Agent 实例
 *
 * 清理项：
 * 1. 取消所有调度的推送任务
 * 2. 取消所有调度的网络推送任务
 * 3. 停止快照轮询定时器
 * 4. 调用实例的 dispose 方法（关闭 WebSocket）
 * 5. 清空单例引用
 */
export function disposeAgent(): void {
  cancelScheduledPush()
  cancelScheduledNetworkPush()
  stopSnapshotPolling() // ✅ 清理快照轮询定时器

  if (activeAgentInstance) {
    activeAgentInstance.dispose()
    activeAgentInstance = null
  }
}
```

**关键设计点**：

- ✅ 模块级单例（`activeAgentInstance`）由 `lifecycle.ts` 统一持有
- ✅ **拆分钩子管理**：进程级全局钩子（`processGlobalHooksInstalled`，永不重置）+ 实例级定时器（`snapshotPollingTimer`，随实例启停）
- ✅ `instance.dispose()` 显式清理快照轮询定时器（修复泄漏）
- ✅ 6 步初始化管道严格线性执行，时序保证通过代码顺序实现
- ✅ 恢复 WebSocket 诊断日志（`onOpen`、`onError`），保持排障可观测性
- ✅ 入口文件通过 `getUni` 参数传入运行时差异（Vue 2 需回退到 `wx`，Vue 3 仅 `uni`）

---

### 2.3 `index.ts` - Vue 3 入口（重构后 ~30 行）

**职责**：

- 组装 Vue 3 专属 RPC 方法（pinia 3个、renderCode 1个、recomputeComponentState 1个）
- 调用 `initAgentPipeline` 初始化探针
- 重导出公共 API 以保持向后兼容

**重构后代码**：

```typescript
/**
 * Uni-Helper DevTools 运行时探针入口（Vue 3 + Pinia）
 * 运行在小程序 / App 等受检沙箱环境
 */

import type { AgentConfig, AgentInstance } from './lifecycle'
import { createBaseRpcFunctions } from './rpc-base'
import { initAgentPipeline, getAgentInstance, disposeAgent } from './lifecycle'
import {
  type PiniaStateResult,
  type PiniaStoresResult,
  type UpdatePiniaStateResult,
  getPiniaState,
  getPiniaStores,
  updatePiniaState,
} from './pinia'
import { getComponentRenderCode } from './render-code'
import { recomputeComponentState } from './state'

export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  const clientFunctions = {
    ...createBaseRpcFunctions(), // 8 个基础 RPC 方法（强类型展开）

    // Vue 3 专属方法（5 个）
    'uni-devtools:agent:getComponentRenderCode': (
      params: { id: string } | string,
    ): { code?: string } => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentRenderCode(id)
    },
    'uni-devtools:agent:recomputeComponentState': (params: {
      id: string
      section: string
      path: string[]
    }): { ok: boolean } => {
      return recomputeComponentState(params.id, params.section, params.path)
    },
    'uni-devtools:agent:getPiniaStores': (): PiniaStoresResult => {
      return getPiniaStores()
    },
    'uni-devtools:agent:getPiniaState': (
      args: { id: string } | string,
    ): PiniaStateResult => {
      const id = typeof args === 'string' ? args : args?.id
      return getPiniaState(id)
    },
    'uni-devtools:agent:updatePiniaState': (
      params: any,
    ): UpdatePiniaStateResult => {
      return updatePiniaState(params)
    },
  }

  return initAgentPipeline({
    clientFunctions,
    customConfig,
    getUni: () => (typeof uni !== 'undefined' ? uni : (globalThis as any).uni),
  })
}

export { getAgentInstance, disposeAgent }

// 向后兼容导出（按实际模块分别 re-export，保持现有外部消费方不受影响）
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

**关键设计点**：

- ✅ 使用 `{...createBaseRpcFunctions(), ...vue3Methods}` 组装，类型完整保留
- ✅ 直接 import `pinia.ts` 和 `render-code.ts`（Vue 3 专属模块）
- ✅ 入口仅 30 行逻辑代码（不含 import 和 export）
- ✅ 底部重导出保持向后兼容

---

### 2.4 `vue2.ts` - Vue 2 入口（重构后 ~25 行）

**职责**：

- 仅使用 8 个基础 RPC 方法（不包含 Vue 3 专属方法）
- 调用 `initAgentPipeline` 初始化探针
- 运行时回退到 `wx`（微信小程序环境下 `uni` 可能不存在）

**重构后代码**：

```typescript
/**
 * Vue 2（webpack 构建线）探针入口
 *
 * 产物形态：预构建为 `dist/agent-vue2.mjs`（esbuild bundle）
 * 冻结契约：子路径 `@uni-helper/devtools-devframe/agent/vue2`，导出 `initAgent()`
 * 配置模块：`virtual:uni-devtools-agent`，形状 `{ wsUrl, token, clientMarker }`
 *
 * Vue 2 探针**不注册** Vue 3 专属方法：
 * - recomputeComponentState（Vue 2 computed 不需要重算）
 * - getComponentRenderCode（Vue 2 无 template 编译产物可读）
 * - pinia 三条（Pinia 依赖 Vue 3 Composition API）
 */

import type { AgentConfig, AgentInstance } from './lifecycle'
import { createBaseRpcFunctions } from './rpc-base'
import { initAgentPipeline, getAgentInstance, disposeAgent } from './lifecycle'

declare const uni: any
declare const wx: any

export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  return initAgentPipeline({
    clientFunctions: createBaseRpcFunctions(), // 仅 8 个基础 RPC 方法
    customConfig,
    // Vue 2 运行时回退逻辑：uni → wx → globalThis.uni → globalThis.wx
    getUni: () =>
      typeof uni !== 'undefined'
        ? uni
        : (typeof globalThis !== 'undefined' && (globalThis as any).uni) ||
          (typeof wx !== 'undefined'
            ? wx
            : typeof globalThis !== 'undefined'
              ? (globalThis as any).wx
              : undefined),
  })
}

export { getAgentInstance, disposeAgent }
```

**关键设计点**：

- ✅ 仅使用 `createBaseRpcFunctions()`，不添加任何 Vue 3 专属方法
- ✅ 零 import `pinia.ts` 和 `render-code.ts`（物理隔离，打包零污染）
- ✅ 入口仅 25 行逻辑代码
- ✅ 运行时回退到 `wx`（适配微信小程序环境）

---

## 三、实施步骤

### Phase 1：创建 `rpc-base.ts`（约 1 小时）

1. 创建 `packages/devframe/src/agent/rpc-base.ts`
2. 从 `index.ts` 和 `vue2.ts` 中提取以下内容：
   - `getCurrentPagesSafe()` 函数
   - 8 个基础 RPC 方法的实现
   - 添加 `resolveRuntimeUni()` 工具函数
3. 补充强类型返回值声明（显式声明每个 RPC 方法的签名）
4. 单元测试：
   ```bash
   # 创建 packages/devframe/test/rpc-base.test.ts
   pnpm --filter @uni-helper/devtools-devframe test rpc-base.test.ts
   ```
5. 验证：
   - 类型检查通过：`tsc --noEmit`
   - 单测通过：至少覆盖 `createBaseRpcFunctions` 返回对象的结构和类型

---

### Phase 2：创建 `lifecycle.ts`（约 1.5 小时）

1. 创建 `packages/devframe/src/agent/lifecycle.ts`
2. 从 `index.ts` 和 `vue2.ts` 中提取以下内容：
   - `activeAgentInstance` 模块级变量
   - `setupChangeDetectionHooks()` 函数（修改为返回清理句柄）
   - `initAgent()` 的初始化流程（重命名为 `initAgentPipeline`）
   - `getAgentInstance()` 和 `disposeAgent()` 函数（修改 `disposeAgent` 清理定时器）
3. 修复定时器泄漏：
   ```typescript
   // 保存定时器 ID
   const timerId = setInterval(...)

   // 返回清理函数
   return () => {
     clearInterval(timerId)
     changeHooksInstalled = false
   }
   ```
4. 单元测试：
   ```bash
   # 创建 packages/devframe/test/lifecycle.test.ts
   pnpm --filter @uni-helper/devtools-devframe test lifecycle.test.ts
   ```
5. 验证：
   - `initAgentPipeline` 按顺序执行 6 步初始化
   - `disposeAgent` 清理定时器（使用 `vi.useFakeTimers()` 验证）
   - 单例防重复初始化逻辑正常工作

---

### Phase 3：重构 `index.ts`（Vue 3 入口）（约 0.5 小时）

1. 修改 `packages/devframe/src/agent/index.ts`：
   - 删除重复的初始化逻辑（约 260 行）
   - 导入 `createBaseRpcFunctions` 和 `initAgentPipeline`
   - 使用 Object Spread 组装 RPC 方法
   - 调用 `initAgentPipeline` 并传入 Vue 3 专属方法
2. 保持底部的重导出语句（16 个函数）不变
3. 验证：
   ```bash
   pnpm --filter @uni-helper/devtools-devframe test
   ```
4. 预期结果：136 项单测全部通过（0 项失败）

---

### Phase 4：重构 `vue2.ts`（Vue 2 入口）（约 0.5 小时）

1. 修改 `packages/devframe/src/agent/vue2.ts`：
   - 删除重复的初始化逻辑（约 250 行）
   - 导入 `createBaseRpcFunctions` 和 `initAgentPipeline`
   - 调用 `initAgentPipeline` 并传入基础 RPC 方法
   - 保持运行时回退逻辑（`uni → wx → globalThis.uni → globalThis.wx`）
2. 验证：
   ```bash
   pnpm --filter @uni-helper/devtools-devframe build:agent-vue2
   ls -lh packages/devframe/dist/agent-vue2.mjs
   grep -i "pinia" packages/devframe/dist/agent-vue2.mjs  # 应该找不到
   ```
3. 预期结果：
   - 构建成功，产物约 70-72KB
   - 产物中不包含 `pinia` 字符串（打包零污染）

---

### Phase 5：端到端验证（约 1 小时）

1. **单元测试全量验证**：

   ```bash
   pnpm --filter @uni-helper/devtools-devframe test
   ```

   预期：136 项测试全部通过

2. **真机验证（Vue 2 + Webpack）**：

   ```bash
   cd spike/uni-vue2-webpack
   npm run dev:mp-weixin
   ```

   在微信开发者工具中验证：
   - 探针 WebSocket 连接成功
   - 组件树正常上报
   - 状态修改生效
   - 网络拦截正常工作

3. **打包产物验证**：

   ```bash
   # 检查 Vue 2 bundle 体积
   ls -lh packages/devframe/dist/agent-vue2.mjs

   # 检查是否包含 Pinia（toRaw/isRef 作为属性名是安全的，不应检查）
   grep -i "pinia" packages/devframe/dist/agent-vue2.mjs

   # 预期：无匹配（物理隔离成功）
   ```

4. **类型检查**：
   ```bash
   pnpm --filter @uni-helper/devtools-devframe exec tsc --noEmit
   ```
   预期：0 个类型错误

---

## 四、风险评估与缓解措施

### 风险 1：单例统一管理导致测试套件状态互踩

**风险级别**：低  
**描述**：测试套件中同时导入 `index.ts` 和 `vue2.ts` 时，两者共享 `lifecycle.ts` 的单例状态，可能导致后者覆盖前者。

**缓解措施**：

1. **检查现有单测**：审查 136 项单测，确认是否存在"并行实例化两个版本"的场景
2. **测试隔离**：如果存在跨版本测试，在 `beforeEach` 中调用 `disposeAgent()` 清空单例
3. **降级方案**：如果确实无法通过测试隔离解决，可将 `lifecycle.ts` 改为导出工厂函数（`createLifecycleManager()`），让两个入口各自创建管理器实例

---

### 风险 2：esbuild 打包 Vue 2 时隐式引入 Vue 3 依赖

**风险级别**：低  
**描述**：如果 `rpc-base.ts` 或 `lifecycle.ts` 不小心 import 了 Vue 3 专属模块，esbuild 会将其打包进 `dist/agent-vue2.mjs`，导致运行时错误。

**缓解措施**：

1. **静态分析**：在 Phase 4 验证步骤中，使用 `grep` 检查产物中是否包含 `pinia` 关键字（注意：`toRaw`/`isRef` 作为属性名在 `serialize.ts` 中是安全的，不应检查）
2. **CI 检查**：在 CI 流程中增加自动化检查：
   ```bash
   # .github/workflows/ci.yml
   - name: Check Vue 2 bundle purity
     run: |
       pnpm --filter @uni-helper/devtools-devframe build:agent-vue2
       if grep -qi "pinia" packages/devframe/dist/agent-vue2.mjs; then
         echo "❌ Vue 2 bundle contains Pinia dependency!"
         exit 1
       fi
   ```
3. **代码审查**：PR 审查时重点检查 `rpc-base.ts` 和 `lifecycle.ts` 的 import 语句

---

### 风险 3：定时器清理不完全导致新的内存泄漏

**风险级别**：低  
**描述**：除了 `setInterval` 外，可能还有其他未清理的监听器或定时器。

**缓解措施**：

1. **代码审查**：逐行审查 `setupChangeDetectionHooks` 中的所有监听器注册逻辑
2. **测试验证**：编写单测验证 `disposeAgent` 清理的完整性：
   ```typescript
   test('should cleanup all timers and listeners', () => {
     vi.useFakeTimers()
     initAgent()
     expect(vi.getTimerCount()).toBe(1) // 快照轮询定时器

     disposeAgent()
     expect(vi.getTimerCount()).toBe(0) // 所有定时器已清理
   })
   ```

---

### 风险 4：向后兼容性破坏

**风险级别**：极低  
**描述**：外部消费方可能直接 import `index.ts` 底部重导出的辅助函数，重构后这些导出路径可能失效。

**缓解措施**：

1. **保留重导出**：在 Phase 3 中确保 `index.ts` 底部的 16 个重导出语句完全保留
2. **单测覆盖**：现有 136 项单测已覆盖这些导出函数，通过单测验证向后兼容性
3. **文档说明**：在 CHANGELOG 中明确说明：
   ```
   ## [0.1.0] - 2026-10-05
   ### Changed
   - Refactor agent architecture to eliminate 80% code duplication
   - **BREAKING**: 无（所有公共 API 保持向后兼容）
   ```

---

## 五、验收标准

### 功能验收

- [ ] 136 项现有单元测试 100% 通过（0 项失败）
- [ ] Vue 3 探针正常工作：组件树上报、Pinia 状态读写、renderCode 获取
- [ ] Vue 2 探针正常工作：组件树上报、状态修改、网络拦截
- [ ] 微信小程序真机环境验证通过（spike/uni-vue2-webpack）
- [ ] 定时器清理验证通过（多次 `initAgent` / `disposeAgent` 无泄漏）

### 代码质量验收

- [ ] TypeScript 类型检查通过（`tsc --noEmit`）
- [ ] ESLint 检查通过（无新增 warnings 或 errors）
- [ ] `rpc-base.ts` 和 `lifecycle.ts` 的单元测试覆盖率 > 80%
- [ ] 代码审查通过（重点检查 import 依赖关系）

### 打包验收

- [ ] `dist/agent-vue2.mjs` 构建成功，体积约 70-72KB
- [ ] `dist/agent-vue2.mjs` 中不包含 `pinia` 关键字（物理隔离验证）
- [ ] `dist/agent-vue2.mjs` 在 Webpack 4 + Vue 2.6 环境中运行无报错

### 性能验收

- [ ] 探针初始化时间 < 100ms（与重构前持平）
- [ ] 快照轮询定时器正常工作（2 秒间隔）
- [ ] `disposeAgent` 清理所有定时器（验证无残留）

---

## 六、回滚计划

如果重构后出现严重问题且无法在 1 个工作日内修复，执行以下回滚步骤：

1. **Git 回滚**：

   ```bash
   git revert <commit-hash>
   git push origin feat/vue2-webpack-support
   ```

2. **临时修复定时器泄漏**（最小化修改）：

   ```typescript
   // index.ts 和 vue2.ts 中各自修改
   let snapshotPollingTimerId: any = null

   function setupChangeDetectionHooks(): void {
     // ...
     snapshotPollingTimerId = setInterval(...)
   }

   export function disposeAgent(): void {
     if (snapshotPollingTimerId !== null) {
       clearInterval(snapshotPollingTimerId)
       snapshotPollingTimerId = null
     }
     // ...
   }
   ```

3. **重新评估方案**：组织技术评审，确定是否需要调整架构设计

---

## 七、后续优化方向

本次重构完成后，可考虑以下进一步优化：

1. **性能优化**：
   - 快照轮询间隔从 2000ms 调整为自适应（页面活跃时缩短，静默时延长）
   - 组件树采集深度可配置（通过 `virtual:uni-devtools-agent` 配置）

2. **可测试性增强**：
   - 为 `initAgentPipeline` 增加 `onStep` 钩子，便于单测验证每步执行
   - 将 WebSocket 通道抽象为接口，便于 mock 测试

3. **类型安全进一步加强**：
   - 将 `clientFunctions` 从 `Record<string, any>` 改为严格的 RPC 方法联合类型
   - 使用 `birpc` 的类型推导能力，自动生成客户端类型定义

4. **多版本支持**：
   - 如果未来需要支持 Vue 2.7（支持部分 Composition API），可在入口选择性启用部分 Vue 3 方法
   - 通过配置标志（如 `enablePinia: boolean`）动态组装 RPC 方法

---

## 八、补充验证点（根据 agy 审阅建议）

在实施验证阶段，建议补充以下 3 个关键测试场景：

### 8.1 跨版本实例隔离测试（单测级别）

**目的**：验证 Vue 2 实例不包含 Vue 3 专属方法，确保单例状态重置无残留。

**测试代码**：

```typescript
// packages/devframe/test/cross-version-isolation.test.ts
import { describe, it, expect, beforeEach } from 'vitest'

describe('Cross-version instance isolation', () => {
  beforeEach(() => {
    // 每个测试前清空单例
    const { disposeAgent: disposeVue3 } = await import('../src/agent/index')
    const { disposeAgent: disposeVue2 } = await import('../src/agent/vue2')
    disposeVue3()
    disposeVue2()
  })

  it('Vue 2 instance should not have Vue 3 exclusive methods', async () => {
    const { initAgent: initVue2 } = await import('../src/agent/vue2')
    const vue2Instance = initVue2({ wsUrl: 'ws://test', token: 'test' })

    // 验证 Vue 2 实例的 RPC 方法列表
    const rpcMethods = Object.keys(vue2Instance.rpc._functions || {})

    // 不应包含 Vue 3 专属方法
    expect(rpcMethods).not.toContain('uni-devtools:agent:getPiniaStores')
    expect(rpcMethods).not.toContain('uni-devtools:agent:getComponentRenderCode')
    expect(rpcMethods).not.toContain('uni-devtools:agent:recomputeComponentState')

    // 应包含基础方法
    expect(rpcMethods).toContain('uni-devtools:agent:ping')
    expect(rpcMethods).toContain('uni-devtools:agent:getComponentTree')
  })

  it('Singleton state should reset cleanly after dispose', async () => {
    const { initAgent: initVue3, disposeAgent, getAgentInstance } = await import('../src/agent/index')

    const instance1 = initVue3({ wsUrl: 'ws://test1', token: 'test1' })
    expect(getAgentInstance()).toBe(instance1)

    disposeAgent()
    expect(getAgentInstance()).toBeNull()

    const instance2 = initVue3({ wsUrl: 'ws://test2', token: 'test2' })
    expect(getAgentInstance()).toBe(instance2)
    expect(instance2).not.toBe(instance1)
  })
})
```

---

### 8.2 多轮初始化监听器计数验证

**目的**：确保快照轮询定时器始终维持在 0 或 1 个，`uni.addInterceptor` 注册的拦截层数不随初始化次数线性叠加。

**测试代码**：

```typescript
// packages/devframe/test/listener-leak.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Multiple initialization listener leak prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Snapshot polling timer should not accumulate', async () => {
    const { initAgent, disposeAgent } = await import('../src/agent/index')

    // 第 1 轮初始化
    initAgent({ wsUrl: 'ws://test', token: 'test' })
    expect(vi.getTimerCount()).toBe(1) // 1 个快照轮询定时器

    disposeAgent()
    expect(vi.getTimerCount()).toBe(0) // 已清理

    // 第 2 轮初始化
    initAgent({ wsUrl: 'ws://test', token: 'test' })
    expect(vi.getTimerCount()).toBe(1) // 仍然只有 1 个

    disposeAgent()
    expect(vi.getTimerCount()).toBe(0)

    // 第 3-5 轮初始化
    for (let i = 0; i < 3; i++) {
      initAgent({ wsUrl: 'ws://test', token: 'test' })
      expect(vi.getTimerCount()).toBe(1) // 始终保持 1 个
      disposeAgent()
      expect(vi.getTimerCount()).toBe(0)
    }
  })

  it('Global hooks should not be registered multiple times', async () => {
    const mockUni = {
      addInterceptor: vi.fn(),
    }
    global.uni = mockUni

    const { initAgent, disposeAgent } = await import('../src/agent/index')

    // 第 1 轮初始化
    initAgent({ wsUrl: 'ws://test', token: 'test' })
    const firstCallCount = mockUni.addInterceptor.mock.calls.length
    expect(firstCallCount).toBe(5) // navigateTo, redirectTo, reLaunch, switchTab, navigateBack

    disposeAgent()

    // 第 2 轮初始化
    initAgent({ wsUrl: 'ws://test', token: 'test' })
    const secondCallCount = mockUni.addInterceptor.mock.calls.length
    expect(secondCallCount).toBe(firstCallCount) // ✅ 不应增加，processGlobalHooksInstalled 防止重复注册

    delete global.uni
  })
})
```

---

### 8.3 真实 Webpack 4 / Vue 2.6 编译构建验证

**目的**：在真实的 Webpack 4 + Vue 2.6 环境中验证打包产物无 Vue 3 依赖泄漏。

**验证步骤**：

```bash
# 1. 进入 Vue 2 测试项目
cd spike/uni-vue2-webpack

# 2. 清理旧构建产物
rm -rf dist node_modules/.cache

# 3. 重新安装依赖（确保使用最新的 devframe 包）
npm install

# 4. 执行微信小程序构建
npm run build:mp-weixin

# 5. 检查构建产物
ls -lh dist/build/mp-weixin/common/vendor.js

# 6. 验证无 Vue 3 API 缺失报错
grep -i "isRef is not defined\|toRaw is not defined" dist/build/mp-weixin/common/vendor.js
# 预期：无匹配

# 7. 在微信开发者工具中真机测试
# - 导入项目：dist/build/mp-weixin
# - 编译并运行
# - 验证探针 WebSocket 连接成功
# - 验证组件树正常上报
# - 验证状态修改生效
```

**验收标准**：

- ✅ Webpack 4 构建成功，无编译错误
- ✅ `vendor.js` 中不包含 `isRef is not defined` 或 `toRaw is not defined` 错误
- ✅ 微信开发者工具真机运行无报错
- ✅ 探针功能正常工作（组件树、状态修改、网络拦截）

---

## 九、参考资料

- **讨论记录**：`/Users/mac/.seedmux/team/discussions/D-681430/ledger.md`
- **原始方案文档**：`/Users/mac/Documents/workspace/DBAA/devtools/packages/devframe/ARCHITECTURE_PROPOSAL.md`
- **现有代码**：
  - `packages/devframe/src/agent/index.ts`（Vue 3 入口，317 行）
  - `packages/devframe/src/agent/vue2.ts`（Vue 2 入口，288 行）
- **单元测试**：`packages/devframe/test/`（136 项测试）
- **构建配置**：`packages/devframe/package.json:29-32`（esbuild 构建脚本）
