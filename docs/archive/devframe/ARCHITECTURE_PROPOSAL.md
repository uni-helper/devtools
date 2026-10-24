# Agent 架构重构方案

## 现状问题

当前 `agent/index.ts` (Vue 3) 和 `agent/vue2.ts` 存在：

- 80% 代码重复（agent 初始化、WebSocket、钩子安装、路由等）
- 分支逻辑混杂在单一文件中
- 维护成本高：bug 修复需要两处同步

## 方案对比

### 方案一：共享核心 + 能力注册（推荐 ⭐）

**架构：**

```
src/agent/
├── core/
│   ├── base-agent.ts          # 核心初始化逻辑
│   ├── change-detection.ts    # 变更检测钩子（共享）
│   ├── client-builder.ts      # RPC 函数注册器
│   └── types.ts               # 共享类型
├── capabilities/
│   ├── component.ts           # 组件树（共享）
│   ├── network.ts             # 网络拦截（共享）
│   ├── router.ts              # 路由信息（共享）
│   ├── pinia.ts               # Pinia（Vue 3 专属）
│   ├── render-code.ts         # 渲染代码（Vue 3 专属）
│   └── computed-recompute.ts  # 计算属性（Vue 3 专属）
├── index.ts                   # Vue 3 入口
└── vue2.ts                    # Vue 2 入口
```

**代码示例：**

```typescript
// core/base-agent.ts
export interface AgentCapability {
  name: string
  rpcMethods: Record<string, Function>
  onInit?: () => void
  onDispose?: () => void
}

export function createAgent(
  capabilities: AgentCapability[],
  config: AgentConfig,
) {
  const clientFunctions = {}

  // 合并所有能力的 RPC 方法
  for (const cap of capabilities) {
    Object.assign(clientFunctions, cap.rpcMethods)
  }

  // 初始化所有能力
  for (const cap of capabilities) {
    cap.onInit?.()
  }

  // ... 核心初始化逻辑

  return {
    rpc,
    socketHandle,
    dispose: () => {
      for (const cap of capabilities) {
        cap.onDispose?.()
      }
      // ...
    },
  }
}
```

```typescript
// capabilities/component.ts
export const componentCapability: AgentCapability = {
  name: 'component',
  rpcMethods: {
    'uni-devtools:agent:getComponentTree': () => ({
      pages: collectComponentTree(),
      vueVersion: getVueRuntimeVersion(),
    }),
    'uni-devtools:agent:getComponentState': (params) => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentState(id)
    },
    'uni-devtools:agent:updateComponentState': (params, maybeKey, maybeVal) => {
      // ...
    },
  },
}
```

```typescript
// capabilities/pinia.ts（Vue 3 专属）
export const piniaCapability: AgentCapability = {
  name: 'pinia',
  rpcMethods: {
    'uni-devtools:agent:getPiniaStores': () => getPiniaStores(),
    'uni-devtools:agent:getPiniaState': (args) => {
      const id = typeof args === 'string' ? args : args?.id
      return getPiniaState(id)
    },
    'uni-devtools:agent:updatePiniaState': (params) => updatePiniaState(params),
  },
}
```

```typescript
// index.ts（Vue 3 入口）
import { createAgent } from './core/base-agent'
import { componentCapability } from './capabilities/component'
import { networkCapability } from './capabilities/network'
import { routerCapability } from './capabilities/router'
import { piniaCapability } from './capabilities/pinia'
import { renderCodeCapability } from './capabilities/render-code'

export function initAgent(config) {
  return createAgent(
    [
      componentCapability,
      networkCapability,
      routerCapability,
      piniaCapability, // Vue 3 专属
      renderCodeCapability, // Vue 3 专属
    ],
    config,
  )
}
```

```typescript
// vue2.ts（Vue 2 入口）
import { createAgent } from './core/base-agent'
import { componentCapability } from './capabilities/component'
import { networkCapability } from './capabilities/network'
import { routerCapability } from './capabilities/router'

export function initAgent(config) {
  return createAgent(
    [
      componentCapability,
      networkCapability,
      routerCapability,
      // 不包含 pinia、renderCode 等 Vue 3 专属能力
    ],
    config,
  )
}
```

**优点：**

- ✅ 零重复代码
- ✅ 能力清晰隔离，易于测试
- ✅ 新增能力只需新建文件并注册
- ✅ Vue 2/3 差异在入口文件一目了然
- ✅ 支持未来扩展（Vue 2.7 可选启用某些 Vue 3 特性）

**缺点：**

- 需要一次性重构
- 增加抽象层（但复杂度可控）

---

### 方案二：适配器模式

保留现有入口，通过适配器层隔离差异：

```
src/agent/
├── shared/
│   ├── agent-core.ts          # 共享核心逻辑
│   └── ...                    # 现有共享模块
├── adapters/
│   ├── vue3-adapter.ts        # Vue 3 特有方法适配
│   └── vue2-adapter.ts        # Vue 2 适配（空实现或降级）
├── index.ts                   # Vue 3 入口
└── vue2.ts                    # Vue 2 入口
```

**代码示例：**

```typescript
// shared/agent-core.ts
export function createAgentCore(adapter: AgentAdapter, config: AgentConfig) {
  const clientFunctions = {
    'uni-devtools:agent:getComponentTree': () => ({
      pages: collectComponentTree(),
      vueVersion: getVueRuntimeVersion(),
    }),
    'uni-devtools:agent:ping': () => Date.now(),
    ...adapter.getExtraRpcMethods(), // 注入适配器特有方法
  }

  // ... 核心逻辑
}
```

```typescript
// adapters/vue3-adapter.ts
export const vue3Adapter: AgentAdapter = {
  getExtraRpcMethods: () => ({
    'uni-devtools:agent:getPiniaStores': () => getPiniaStores(),
    'uni-devtools:agent:recomputeComponentState': (params) =>
      recomputeComponentState(params.id, params.section, params.path),
    // ...
  }),
}
```

```typescript
// adapters/vue2-adapter.ts
export const vue2Adapter: AgentAdapter = {
  getExtraRpcMethods: () => ({}), // 无额外方法
}
```

**优点：**

- ✅ 重构成本相对较小
- ✅ 适配器模式易于理解

**缺点：**

- ❌ 适配器内部仍可能有重复
- ❌ 共享逻辑和差异逻辑边界模糊

---

### 方案三：条件编译（不推荐）

使用构建时条件或运行时检测：

```typescript
// agent/index.ts（统一入口）
const isVue2 = detectVueVersion() === 2

const clientFunctions = {
  'uni-devtools:agent:getComponentTree': () => {
    /* ... */
  },
  ...(isVue2
    ? {}
    : {
        'uni-devtools:agent:getPiniaStores': () => getPiniaStores(),
        'uni-devtools:agent:recomputeComponentState': (params) => {
          /* ... */
        },
      }),
}
```

**优点：**

- ✅ 单一入口文件

**缺点：**

- ❌ 运行时分支影响性能和可读性
- ❌ 构建时条件需要双构建流程
- ❌ 不符合你当前"两个独立入口"的设计

---

## 推荐决策

**选择方案一**，理由：

1. 你的 package.json 已经设计了两个独立入口（`./agent` 和 `./agent/vue2`），方案一与之契合
2. 能力注册模式是经典的插件化架构，Vue DevTools 官方也用类似方案
3. 重构后维护成本大幅降低，一次投入长期受益
4. 单元测试更容易：每个 capability 可独立测试

## 实施路径

1. **Phase 1**: 抽取核心（不破坏现有功能）
   - 创建 `core/base-agent.ts`
   - 移动共享逻辑（WebSocket、钩子安装）

2. **Phase 2**: 能力拆分
   - 创建 `capabilities/` 目录
   - 逐个迁移功能模块（component → network → router → pinia）

3. **Phase 3**: 重写入口
   - 改造 `index.ts` 和 `vue2.ts` 为薄入口
   - 集成测试验证

4. **Phase 4**: 清理
   - 删除旧代码
   - 更新文档

## 代码量估算

- 新增代码：~300 行（core + capability 框架）
- 重构代码：~600 行（现有逻辑迁移）
- 删除重复：~400 行
- **净减少：~100 行，可维护性提升 5x**
