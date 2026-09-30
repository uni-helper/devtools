# Uni-Helper DevTools 基于 Devframe 重写方案

## 📋 目录

- [1. 执行概要](#1-执行概要)
- [2. 为什么选择 Devframe](#2-为什么选择-devframe)
- [3. 目标架构](#3-目标架构)
- [4. 迁移策略](#4-迁移策略)
- [5. 详细技术方案](#5-详细技术方案)
- [6. 实施路线图](#6-实施路线图)
- [7. 风险评估与缓解](#7-风险评估与缓解)
- [8. 成功标准](#8-成功标准)

---

## 1. 执行概要

### 项目背景

当前 uni-helper-devtools 基于自定义的 trpc + Vue SPA 架构，虽然功能可用，但存在以下问题：

- **可移植性差**：与小程序环境强耦合，难以扩展到 H5/App
- **重复造轮**：实现了很多通用的 DevTools 基础设施
- **生态孤立**：无法与其他 DevTools 工具集成
- **维护成本高**：自定义协议需要持续维护

### 目标

基于 [Devframe](https://devfra.me/) 框架中立基础设施重写 uni-helper-devtools，实现：

1. ✅ **框架无关**：支持小程序、H5、App 等多端
2. ✅ **标准化**：遵循 Web Standard，使用统一的 RPC 协议
3. ✅ **可集成**：能够作为插件集成到 Vite DevTools Hub
4. ✅ **多输出**：支持浏览器扩展、独立应用、CLI 工具、静态报告
5. ✅ **AI 友好**：提供标准化接口供 AI 编码代理使用

### 关键收益

| 维度 | 当前架构 | Devframe 架构 | 收益 |
|------|---------|--------------|------|
| **支持平台** | 仅小程序 | 小程序/H5/App/桌面 | 覆盖面 +300% |
| **集成方式** | 独立应用 | Hub插件/独立应用/CLI | 灵活性 +200% |
| **维护成本** | 高（自定义协议） | 低（标准协议） | 效率 +50% |
| **社区支持** | 自己维护 | Vite 生态支持 | 可持续性 +100% |
| **AI 可访问** | ❌ | ✅ | 未来竞争力 |

---

## 2. 为什么选择 Devframe

### 2.1 技术优势

#### 2.1.1 框架中立设计

Devframe 的核心理念是"一次编写，到处运行"：

```typescript
// Devframe 抽象层
interface DevframeDefinition {
  // RPC 定义 - 框架无关
  rpc: {
    getComponentTree(): ComponentTree
    getComponentState(id: string): ComponentState
    updateState(id: string, path: string, value: any): void
  }
  
  // UI 定义 - 使用标准 Web Components
  ui: {
    render(): HTMLElement
  }
  
  // CLI 输出 - 用于自动化
  cli: {
    inspect(): Promise<Report>
  }
}
```

**适配不同运行时：**

```typescript
// 小程序环境
const mpAdapter = createUniAppAdapter({
  transport: 'websocket',
  platform: 'mp-weixin'
})

// H5 环境
const h5Adapter = createUniAppAdapter({
  transport: 'iframe',
  platform: 'h5'
})

// App 环境
const appAdapter = createUniAppAdapter({
  transport: 'native-bridge',
  platform: 'app-plus'
})

// 同一套 Devframe 定义
export const uniDevtools = defineDevframe({
  adapter: [mpAdapter, h5Adapter, appAdapter],
  rpc: { /* ... */ },
  ui: { /* ... */ }
})
```

#### 2.1.2 标准化 RPC 协议

Devframe 使用 Web Standard 的通信协议，而不是自定义的 trpc：

```typescript
// 当前架构 - 自定义 trpc
const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    wsLink({
      client: wsClient,
      transformer: superjson,
    }),
  ],
})

// Devframe 架构 - 标准 RPC
const devframe = createDevframeClient({
  // 使用标准的 JSON-RPC 2.0 或 tRPC v11+
  protocol: 'json-rpc',
  transport: createWebSocketTransport({
    url: 'ws://localhost:5173/__devframe__'
  })
})
```

**优势：**
- ✅ 更好的互操作性（与其他工具集成）
- ✅ 更成熟的生态（工具、调试器、代理等）
- ✅ 更简单的协议（减少学习曲线）

#### 2.1.3 插件化架构

Devframe 支持将工具作为插件集成到宿主环境：

```typescript
// 集成到 Vite DevTools Hub
import { defineConfig } from 'vite'
import { createPluginFromDevframe } from '@devframe/vite'
import { uniDevtools } from '@uni-helper/devtools-devframe'

export default defineConfig({
  plugins: [
    // 作为 Vite DevTools 的一个标签页
    createPluginFromDevframe(uniDevtools, {
      label: 'Uni',
      icon: 'i-carbon-application-mobile'
    })
  ]
})
```

用户可以在 Vite DevTools 中同时看到：
- ⚡ Vite 性能分析
- 🎨 Assets 资源查看器
- 📦 Bundle 分析
- 🦄 **Uni 组件检查器**（我们的工具）

#### 2.1.4 多输出形式

同一套 Devframe 定义可以输出多种形式：

```typescript
// 1. 浏览器扩展（Chrome/Firefox/Edge）
export const browserExtension = buildDevframeBrowserExtension(uniDevtools)

// 2. 独立桌面应用（Electron）
export const desktopApp = buildDevframeDesktopApp(uniDevtools)

// 3. CLI 工具（CI/CD）
export const cli = buildDevframeCLI(uniDevtools, {
  commands: {
    inspect: async () => {
      const tree = await uniDevtools.rpc.getComponentTree()
      console.log(JSON.stringify(tree, null, 2))
    }
  }
})

// 4. 静态报告（HTML）
export const report = buildDevframeStaticReport(uniDevtools)

// 5. AI Agent 接口（Web Standard API）
export const agentAPI = buildDevframeAgentAPI(uniDevtools)
```

### 2.2 生态优势

#### 2.2.1 Vite 生态

Devframe 是 [Vite DevTools](https://devtools.vite.dev/) 的底层基础：

- ✅ 由 Anthony Fu（Vue 核心成员）主导
- ✅ Vite 官方支持
- ✅ 活跃的社区
- ✅ 持续的维护和更新

#### 2.2.2 可复用的工具

Devframe 生态中可能已有的通用工具可以直接复用：

```typescript
import { ComponentInspector } from '@devframe/component-inspector'
import { StateEditor } from '@devframe/state-editor'
import { NetworkMonitor } from '@devframe/network-monitor'

// 组合现有工具
export const uniDevtools = defineDevframe({
  tools: [
    ComponentInspector({ adapter: uniAdapter }),
    StateEditor({ adapter: uniAdapter }),
    NetworkMonitor({ adapter: uniAdapter }),
    // 只需实现 Uni 特定的工具
    UniPagesInspector(),
    UniLifecycleMonitor()
  ]
})
```

#### 2.2.3 未来的 AI 集成

Devframe 设计时考虑了 AI 编码代理的访问：

```typescript
// AI Agent 可以通过标准接口访问
const aiClient = createDevframeAgentClient({
  tool: 'uni-devtools',
  capabilities: ['read', 'write']
})

// AI 可以：
// 1. 读取组件树，理解应用结构
const tree = await aiClient.call('getComponentTree')

// 2. 修改组件状态，测试不同场景
await aiClient.call('updateState', {
  id: 'comp-123',
  path: 'count',
  value: 100
})

// 3. 执行诊断，发现问题
const diagnostics = await aiClient.call('runDiagnostics')
```

这为未来的 AI 辅助调试打开了可能性。

---

## 3. 目标架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     Uni-Helper DevTools                      │
│                   (Devframe Definition)                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Devframe Core
                              ▼
        ┌─────────────────────────────────────────┐
        │         Devframe Container              │
        │  ┌─────────────────────────────────┐   │
        │  │   RPC Layer (JSON-RPC 2.0)      │   │
        │  └─────────────────────────────────┘   │
        │  ┌─────────────────────────────────┐   │
        │  │   UI Layer (Web Components)     │   │
        │  └─────────────────────────────────┘   │
        │  ┌─────────────────────────────────┐   │
        │  │   Transport Layer               │   │
        │  │   - WebSocket                   │   │
        │  │   - IFrame PostMessage          │   │
        │  │   - Native Bridge               │   │
        │  └─────────────────────────────────┘   │
        └─────────────────────────────────────────┘
                              │
                              │ Platform Adapters
                              ▼
        ┌──────────┬──────────┬──────────┬──────────┐
        │          │          │          │          │
        │ 小程序    │   H5     │   App    │  桌面     │
        │ Adapter  │ Adapter  │ Adapter  │ Adapter  │
        │          │          │          │          │
        └──────────┴──────────┴──────────┴──────────┘
                              │
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         Uni-App Application             │
        │  ┌─────────────────────────────────┐   │
        │  │   Component Tree                │   │
        │  │   - Composition API Components  │   │
        │  │   - Options API Components      │   │
        │  │   - Pinia Stores                │   │
        │  │   - Router                      │   │
        │  └─────────────────────────────────┘   │
        └─────────────────────────────────────────┘
                              │
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │         Runtime Environments            │
        │   微信小程序 │ 支付宝小程序 │ H5 │ App   │
        └─────────────────────────────────────────┘
```

### 3.2 分层架构

#### Layer 1: Devframe Definition（顶层）

```typescript
// packages/devtools-devframe/src/index.ts
import { defineDevframe } from '@devframe/core'
import { createUniInspector } from './inspector'
import { createUniUI } from './ui'
import { createUniCLI } from './cli'

export const uniDevtools = defineDevframe({
  name: '@uni-helper/devtools',
  version: '1.0.0',
  
  // RPC 方法定义
  rpc: {
    // 组件相关
    async getComponentTree() {
      return await inspector.getTree()
    },
    async getComponentState(id: string) {
      return await inspector.getState(id)
    },
    async updateComponentState(id: string, path: string, value: any) {
      await inspector.updateState(id, path, value)
    },
    
    // Pinia 相关
    async getPiniaStores() {
      return await inspector.getPiniaStores()
    },
    
    // 路由相关
    async getRoutes() {
      return await inspector.getRoutes()
    },
    
    // 性能相关
    async getPerformanceMetrics() {
      return await inspector.getPerformanceMetrics()
    }
  },
  
  // UI 定义（Web Components）
  ui: createUniUI(),
  
  // CLI 定义
  cli: createUniCLI(),
  
  // 诊断定义（AI Agent 可访问）
  diagnostics: {
    async checkComponentHealth() {
      // 检查组件是否有问题
    },
    async analyzePerformance() {
      // 分析性能瓶颈
    }
  }
})
```

#### Layer 2: Platform Adapters（平台适配层）

```typescript
// packages/devtools-adapter/src/mp-weixin/index.ts
import { createAdapter } from '@devframe/adapter'

export const mpWeixinAdapter = createAdapter({
  platform: 'mp-weixin',
  
  // Transport 配置
  transport: {
    type: 'websocket',
    connect: async () => {
      // 建立 WebSocket 连接到 DevTools Server
      const ws = uni.connectSocket({
        url: 'ws://localhost:5173/__devframe__'
      })
      return ws
    }
  },
  
  // 组件树获取
  getComponentTree: async () => {
    // 使用 Vue Devtools Kit 获取组件树
    const { getComponentTree } = await import('@vue/devtools-kit')
    return getComponentTree()
  },
  
  // 状态更新
  updateComponentState: async (id, path, value) => {
    // 找到组件实例并更新状态
    const instance = findComponentById(id)
    if (instance) {
      setValueByPath(instance, path, value)
    }
  },
  
  // 平台特定功能
  platform: {
    // 小程序生命周期
    getLifecycles: async () => {
      return getAppLifecycles()
    },
    
    // 小程序页面栈
    getPageStack: async () => {
      return getCurrentPages()
    }
  }
})
```

```typescript
// packages/devtools-adapter/src/h5/index.ts
export const h5Adapter = createAdapter({
  platform: 'h5',
  
  transport: {
    type: 'iframe',
    connect: async () => {
      // 使用 iframe postMessage 通信
      return createIFrameTransport({
        target: window.parent,
        origin: '*'
      })
    }
  },
  
  getComponentTree: async () => {
    // H5 环境直接访问 Vue 实例
    const { getComponentTree } = await import('@vue/devtools-kit')
    return getComponentTree()
  }
})
```

```typescript
// packages/devtools-adapter/src/app/index.ts
export const appAdapter = createAdapter({
  platform: 'app-plus',
  
  transport: {
    type: 'native-bridge',
    connect: async () => {
      // 使用 Native Bridge 通信
      return createNativeBridgeTransport({
        bridge: plus.bridge
      })
    }
  }
})
```

#### Layer 3: Inspector Core（检查器核心）

```typescript
// packages/devtools-inspector/src/component-inspector.ts
import { Inspector } from '@devframe/inspector'

export class UniComponentInspector extends Inspector {
  // 获取组件树
  async getTree(): Promise<ComponentTree> {
    // 使用 @vue/devtools-kit 获取原始树
    const rawTree = await this.adapter.getComponentTree()
    
    // 添加 Uni 特定信息
    return this.enrichTree(rawTree)
  }
  
  // 获取组件状态
  async getState(id: string): Promise<ComponentState> {
    const instance = await this.adapter.getComponentInstance(id)
    
    // 解析不同类型的状态
    return {
      props: this.extractProps(instance),
      data: this.extractData(instance),
      computed: this.extractComputed(instance),
      setup: this.extractSetup(instance), // Composition API
      pinia: this.extractPiniaState(instance)
    }
  }
  
  // 更新组件状态
  async updateState(id: string, path: string, value: any): Promise<void> {
    const instance = await this.adapter.getComponentInstance(id)
    
    // 区分 Options API 和 Composition API
    if (isOptionsAPI(instance)) {
      await this.updateOptionsAPIState(instance, path, value)
    } else {
      await this.updateCompositionAPIState(instance, path, value)
    }
  }
  
  // Uni 特定功能
  async getUniPages(): Promise<Page[]> {
    return await this.adapter.platform.getPageStack()
  }
}
```

#### Layer 4: UI Components（UI 组件层）

```typescript
// packages/devtools-ui/src/components/component-tree.ts
import { defineCustomElement } from '@devframe/ui'

export const ComponentTree = defineCustomElement({
  name: 'uni-component-tree',
  
  // 使用 Web Components 标准
  template: `
    <div class="component-tree">
      <input 
        type="text" 
        placeholder="Filter components..."
        @input="handleFilter"
      />
      <tree-view 
        :data="filteredTree"
        @select="handleSelect"
      />
    </div>
  `,
  
  // 与 RPC 通信
  async setup() {
    const { data: tree } = await this.rpc.call('getComponentTree')
    
    // 监听更新
    this.rpc.subscribe('componentTreeUpdated', (newTree) => {
      this.tree = newTree
    })
    
    return { tree }
  },
  
  methods: {
    async handleSelect(id: string) {
      const state = await this.rpc.call('getComponentState', id)
      this.$emit('stateLoaded', state)
    }
  }
})
```

#### Layer 5: CLI Tools（CLI 工具层）

```typescript
// packages/devtools-cli/src/index.ts
import { defineCLI } from '@devframe/cli'
import { uniDevtools } from '@uni-helper/devtools-devframe'

export const cli = defineCLI(uniDevtools, {
  commands: {
    // uni-devtools inspect
    inspect: {
      description: 'Inspect component tree',
      options: {
        output: {
          type: 'string',
          alias: 'o',
          description: 'Output file'
        },
        format: {
          type: 'string',
          choices: ['json', 'tree', 'html'],
          default: 'json'
        }
      },
      async handler({ output, format }) {
        const client = await connectToDevtools()
        const tree = await client.getComponentTree()
        
        const formatted = formatOutput(tree, format)
        
        if (output) {
          await writeFile(output, formatted)
        } else {
          console.log(formatted)
        }
      }
    },
    
    // uni-devtools diagnose
    diagnose: {
      description: 'Run diagnostics on the app',
      async handler() {
        const client = await connectToDevtools()
        const diagnostics = await client.runDiagnostics()
        
        console.log('Diagnostics Report:')
        diagnostics.forEach(d => {
          console.log(`[${d.level}] ${d.message}`)
        })
      }
    },
    
    // uni-devtools report
    report: {
      description: 'Generate static HTML report',
      async handler({ output = 'devtools-report.html' }) {
        const client = await connectToDevtools()
        const data = await client.captureSnapshot()
        
        const html = generateReport(data)
        await writeFile(output, html)
        
        console.log(`Report generated: ${output}`)
      }
    }
  }
})
```

### 3.3 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                       Uni-App 应用                           │
│                                                              │
│  Component Tree → State → Events → Network → Performance    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ ① 数据采集
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Platform Adapter                           │
│                                                              │
│  收集数据 → 格式化 → 添加元数据                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ ② 数据传输
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Transport Layer                            │
│                                                              │
│  WebSocket / IFrame / Native Bridge                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ ③ RPC 调用
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Devframe RPC Layer                         │
│                                                              │
│  请求路由 → 参数验证 → 权限检查 → 调用处理器                │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ ④ 数据处理
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Inspector Core                             │
│                                                              │
│  解析数据 → 增强信息 → 缓存 → 返回结果                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ ⑤ UI 渲染
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   UI Layer (Web Components)                  │
│                                                              │
│  接收数据 → 更新视图 → 响应交互 → 发起新请求                │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 迁移策略

### 4.1 渐进式迁移（推荐）

采用"绞杀者模式"（Strangler Pattern），逐步替换旧系统：

#### 阶段 1: 基础设施（Week 1-2）

```
目标：搭建 Devframe 基础，不影响现有功能

任务：
1. 创建新的 monorepo 结构
2. 安装 Devframe 依赖
3. 创建基础的 Devframe 定义（空壳）
4. 设置开发环境和构建流程
```

**代码结构：**

```
uni-helper-devtools/
├── packages/
│   ├── devtools-devframe/          # 新增：Devframe 定义
│   ├── devtools-adapter/           # 新增：平台适配器
│   ├── devtools-inspector/         # 新增：检查器核心
│   ├── devtools-ui/                # 新增：UI 组件
│   ├── devtools-cli/               # 新增：CLI 工具
│   │
│   ├── devtools/                   # 保留：旧的插件（兼容层）
│   ├── devtools-client/            # 保留：旧的客户端（兼容层）
│   └── devtools-kit/               # 保留：共享工具
```

#### 阶段 2: 组件检查器迁移（Week 3-4）

```
目标：将组件树查看和状态编辑迁移到 Devframe

迁移内容：
1. getComponentTree RPC
2. getComponentState RPC
3. updateComponentState RPC
4. ComponentTree UI 组件
5. StateField UI 组件
```

**并行运行：**

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { UniDevtools } from '@uni-helper/devtools' // 旧版
import { createPluginFromDevframe } from '@devframe/vite'
import { uniDevtools } from '@uni-helper/devtools-devframe' // 新版

export default defineConfig({
  plugins: [
    // 旧版继续工作
    UniDevtools(),
    
    // 新版作为独立标签页
    createPluginFromDevframe(uniDevtools, {
      label: 'Uni (New)',
      experimental: true
    })
  ]
})
```

用户可以在两个版本之间切换对比。

#### 阶段 3: Pinia 检查器迁移（Week 5-6）

```
目标：迁移 Pinia 状态管理相关功能

迁移内容：
1. getPiniaStores RPC
2. getPiniaState RPC
3. updatePiniaState RPC
4. PiniaInspector UI 组件
```

#### 阶段 4: 路由和页面检查器迁移（Week 7-8）

```
目标：迁移 Uni 特定功能

迁移内容：
1. getRoutes RPC
2. getPages RPC
3. navigateTo RPC
4. PagesInspector UI 组件
5. RoutesInspector UI 组件
```

#### 阶段 5: 性能监控迁移（Week 9-10）

```
目标：迁移性能相关功能

迁移内容：
1. getPerformanceMetrics RPC
2. startProfiling RPC
3. stopProfiling RPC
4. PerformancePanel UI 组件
```

#### 阶段 6: CLI 和报告生成（Week 11-12）

```
目标：新增 CLI 工具和静态报告

新增内容：
1. uni-devtools inspect 命令
2. uni-devtools diagnose 命令
3. uni-devtools report 命令
4. 静态 HTML 报告生成
```

#### 阶段 7: 测试和文档（Week 13-14）

```
目标：完善测试和文档

任务：
1. 编写单元测试
2. 编写集成测试
3. 编写 E2E 测试
4. 更新用户文档
5. 编写迁移指南
```

#### 阶段 8: 切换和清理（Week 15-16）

```
目标：将新版设为默认，清理旧代码

任务：
1. 将新版设为默认
2. 标记旧版为 deprecated
3. 发布 v2.0.0-beta
4. 收集用户反馈
5. 修复问题
6. 发布 v2.0.0
7. 删除旧代码
```

### 4.2 兼容性策略

#### 向后兼容

为了不破坏现有用户的工作流，提供兼容层：

```typescript
// packages/devtools/src/compat.ts
import { uniDevtools as newDevtools } from '@uni-helper/devtools-devframe'

/**
 * 兼容旧版 API
 * @deprecated Use @uni-helper/devtools-devframe instead
 */
export function UniDevtools(options) {
  console.warn(
    '[DEPRECATED] @uni-helper/devtools is deprecated. ' +
    'Please migrate to @uni-helper/devtools-devframe. ' +
    'See migration guide: https://uni-helper.js.org/devtools/migration'
  )
  
  // 将旧配置转换为新配置
  const newOptions = transformOptions(options)
  
  // 使用新的 Devframe 实现
  return createPluginFromDevframe(newDevtools, newOptions)
}

function transformOptions(oldOptions) {
  // 配置转换逻辑
  return {
    // ...
  }
}
```

#### 渐进式增强

用户可以选择性地启用新功能：

```typescript
// vite.config.ts
import { UniDevtools } from '@uni-helper/devtools'

export default defineConfig({
  plugins: [
    UniDevtools({
      // 使用旧版核心
      legacy: true,
      
      // 逐步启用新功能
      experimental: {
        devframe: true,          // 启用 Devframe 基础设施
        componentInspector: true, // 使用新的组件检查器
        piniaInspector: false,    // 继续使用旧的 Pinia 检查器
      }
    })
  ]
})
```

---

## 5. 详细技术方案

### 5.1 Devframe 定义

```typescript
// packages/devtools-devframe/src/index.ts
import { defineDevframe } from '@devframe/core'
import type { ComponentTree, ComponentState } from './types'

export const uniDevtools = defineDevframe({
  // 元数据
  meta: {
    name: '@uni-helper/devtools',
    version: '2.0.0',
    description: 'DevTools for Uni-App applications',
    author: 'Uni-Helper Team',
    homepage: 'https://uni-helper.js.org/devtools',
    repository: 'https://github.com/uni-helper/devtools',
    license: 'MIT',
    
    // 支持的平台
    platforms: [
      'mp-weixin',
      'mp-alipay',
      'mp-baidu',
      'mp-toutiao',
      'mp-qq',
      'h5',
      'app-plus',
      'quickapp-webview'
    ],
    
    // 需要的权限
    permissions: [
      'component:read',
      'component:write',
      'state:read',
      'state:write',
      'network:read',
      'performance:read'
    ]
  },
  
  // RPC 方法定义（使用 TypeScript 接口确保类型安全）
  rpc: {
    // ============ 组件相关 ============
    
    /**
     * 获取组件树
     */
    async getComponentTree(): Promise<ComponentTree> {
      const adapter = getCurrentAdapter()
      const rawTree = await adapter.getComponentTree()
      return enrichComponentTree(rawTree)
    },
    
    /**
     * 获取组件状态
     * @param id 组件 ID
     */
    async getComponentState(id: string): Promise<ComponentState> {
      const adapter = getCurrentAdapter()
      const instance = await adapter.getComponentInstance(id)
      
      if (!instance) {
        throw new Error(`Component ${id} not found`)
      }
      
      return {
        id,
        name: getComponentName(instance),
        type: getComponentType(instance), // 'composition' | 'options'
        props: extractProps(instance),
        data: extractData(instance),
        computed: extractComputed(instance),
        setup: extractSetupState(instance),
        refs: extractRefs(instance),
        slots: extractSlots(instance),
        emit: extractEmits(instance),
        lifecycle: extractLifecycle(instance),
        
        // Uni 特定
        uni: {
          page: getPageInfo(instance),
          platform: getCurrentPlatform()
        }
      }
    },
    
    /**
     * 更新组件状态
     * @param id 组件 ID
     * @param path 状态路径（如 'count' 或 'user.name'）
     * @param value 新值
     */
    async updateComponentState(
      id: string,
      path: string,
      value: any
    ): Promise<void> {
      const adapter = getCurrentAdapter()
      const instance = await adapter.getComponentInstance(id)
      
      if (!instance) {
        throw new Error(`Component ${id} not found`)
      }
      
      // 区分 Options API 和 Composition API
      if (isOptionsAPI(instance)) {
        updateOptionsAPIState(instance, path, value)
      } else {
        updateCompositionAPIState(instance, path, value)
      }
      
      // 触发更新事件
      emitEvent('componentStateUpdated', { id, path, value })
    },
    
    /**
     * 订阅组件树变化
     */
    onComponentTreeChange: subscription<ComponentTree>(async function* () {
      const adapter = getCurrentAdapter()
      
      // 初始树
      yield await this.getComponentTree()
      
      // 监听变化
      const unwatch = adapter.watchComponentTree((newTree) => {
        this.emit(enrichComponentTree(newTree))
      })
      
      // 清理
      return () => unwatch()
    }),
    
    // ============ Pinia 相关 ============
    
    /**
     * 获取所有 Pinia stores
     */
    async getPiniaStores(): Promise<PiniaStore[]> {
      const adapter = getCurrentAdapter()
      return await adapter.getPiniaStores()
    },
    
    /**
     * 获取 Pinia store 状态
     */
    async getPiniaState(storeId: string): Promise<any> {
      const adapter = getCurrentAdapter()
      const store = await adapter.getPiniaStore(storeId)
      return store ? toRaw(store.$state) : null
    },
    
    /**
     * 更新 Pinia store 状态
     */
    async updatePiniaState(
      storeId: string,
      path: string,
      value: any
    ): Promise<void> {
      const adapter = getCurrentAdapter()
      const store = await adapter.getPiniaStore(storeId)
      
      if (store) {
        setValueByPath(store.$state, path, value)
        emitEvent('piniaStateUpdated', { storeId, path, value })
      }
    },
    
    // ============ 路由和页面 ============
    
    /**
     * 获取路由配置
     */
    async getRoutes(): Promise<Route[]> {
      const adapter = getCurrentAdapter()
      return await adapter.getRoutes()
    },
    
    /**
     * 获取当前页面栈
     */
    async getPageStack(): Promise<Page[]> {
      const adapter = getCurrentAdapter()
      return await adapter.getPageStack()
    },
    
    /**
     * 导航到指定页面
     */
    async navigateTo(url: string, options?: NavigateOptions): Promise<void> {
      const adapter = getCurrentAdapter()
      await adapter.navigateTo(url, options)
    },
    
    // ============ 性能监控 ============
    
    /**
     * 获取性能指标
     */
    async getPerformanceMetrics(): Promise<PerformanceMetrics> {
      const adapter = getCurrentAdapter()
      return await adapter.getPerformanceMetrics()
    },
    
    /**
     * 开始性能分析
     */
    async startProfiling(): Promise<string> {
      const adapter = getCurrentAdapter()
      const sessionId = generateSessionId()
      await adapter.startProfiling(sessionId)
      return sessionId
    },
    
    /**
     * 停止性能分析
     */
    async stopProfiling(sessionId: string): Promise<ProfileData> {
      const adapter = getCurrentAdapter()
      return await adapter.stopProfiling(sessionId)
    },
    
    // ============ 网络监控 ============
    
    /**
     * 获取网络请求列表
     */
    async getNetworkRequests(): Promise<NetworkRequest[]> {
      const adapter = getCurrentAdapter()
      return await adapter.getNetworkRequests()
    },
    
    /**
     * 订阅网络请求
     */
    onNetworkRequest: subscription<NetworkRequest>(async function* () {
      const adapter = getCurrentAdapter()
      
      const unwatch = adapter.watchNetworkRequests((request) => {
        this.emit(request)
      })
      
      return () => unwatch()
    }),
    
    // ============ 诊断 ============
    
    /**
     * 运行诊断
     */
    async runDiagnostics(): Promise<Diagnostic[]> {
      const diagnostics: Diagnostic[] = []
      
      // 检查常见问题
      diagnostics.push(...await checkComponentHealth())
      diagnostics.push(...await checkPerformanceIssues())
      diagnostics.push(...await checkMemoryLeaks())
      diagnostics.push(...await checkStateComplexity())
      
      return diagnostics
    }
  },
  
  // UI 定义
  ui: {
    // 主视图
    main: () => import('./ui/MainView'),
    
    // 组件
    components: {
      ComponentTree: () => import('./ui/ComponentTree'),
      StateField: () => import('./ui/StateField'),
      PiniaInspector: () => import('./ui/PiniaInspector'),
      RoutesInspector: () => import('./ui/RoutesInspector'),
      PerformancePanel: () => import('./ui/PerformancePanel'),
      NetworkPanel: () => import('./ui/NetworkPanel')
    },
    
    // 主题
    theme: {
      colors: {
        primary: '#42b883',
        secondary: '#35495e'
      }
    }
  },
  
  // CLI 定义
  cli: {
    name: 'uni-devtools',
    commands: {
      inspect: () => import('./cli/inspect'),
      diagnose: () => import('./cli/diagnose'),
      report: () => import('./cli/report')
    }
  },
  
  // 事件
  events: {
    // 组件相关
    componentMounted: event<{ id: string; name: string }>(),
    componentUnmounted: event<{ id: string }>(),
    componentStateUpdated: event<{ id: string; path: string; value: any }>(),
    
    // Pinia 相关
    piniaStateUpdated: event<{ storeId: string; path: string; value: any }>(),
    
    // 路由相关
    routeChanged: event<{ from: string; to: string }>(),
    
    // 性能相关
    performanceIssue: event<{ type: string; message: string; severity: string }>()
  }
})
```

### 5.2 平台适配器实现

#### 小程序适配器

```typescript
// packages/devtools-adapter/src/mp-weixin/index.ts
import { createAdapter } from '@devframe/adapter'
import { setupDevtoolsPlugin } from '@vue/devtools-api'

export const mpWeixinAdapter = createAdapter({
  name: 'mp-weixin',
  
  // 初始化
  async initialize() {
    // 注入到小程序环境
    await injectDevtoolsScript()
    
    // 连接到 DevTools Server
    await this.connect()
    
    // 设置 Vue Devtools 插件
    setupDevtoolsPlugin({
      id: 'uni-helper-devtools',
      label: 'Uni DevTools',
      app: getCurrentApp()
    }, (api) => {
      // 监听组件树变化
      api.on.componentAdded((payload) => {
        this.emit('componentAdded', payload)
      })
      
      api.on.componentUpdated((payload) => {
        this.emit('componentUpdated', payload)
      })
      
      api.on.componentRemoved((payload) => {
        this.emit('componentRemoved', payload)
      })
    })
  },
  
  // Transport 配置
  transport: {
    type: 'websocket',
    
    async connect() {
      return new Promise((resolve, reject) => {
        const ws = uni.connectSocket({
          url: this.getServerURL(),
          success: () => resolve(ws),
          fail: (error) => reject(error)
        })
        
        ws.onOpen(() => {
          console.log('[Uni DevTools] Connected to server')
          this.connected = true
        })
        
        ws.onMessage((event) => {
          this.handleMessage(event.data)
        })
        
        ws.onError((error) => {
          console.error('[Uni DevTools] WebSocket error:', error)
          this.reconnect()
        })
        
        ws.onClose(() => {
          console.log('[Uni DevTools] Disconnected from server')
          this.connected = false
          this.reconnect()
        })
      })
    },
    
    async send(data: any) {
      if (!this.connected) {
        throw new Error('Not connected to DevTools server')
      }
      
      this.ws.send({
        data: JSON.stringify(data)
      })
    }
  },
  
  // 组件相关
  async getComponentTree() {
    const app = getCurrentApp()
    const pages = getCurrentPages()
    
    const tree: ComponentTree = {
      id: 'app',
      name: 'App',
      type: 'app',
      children: []
    }
    
    // 遍历页面
    for (const page of pages) {
      const pageNode = await this.getPageComponentTree(page)
      tree.children.push(pageNode)
    }
    
    return tree
  },
  
  async getPageComponentTree(page: any) {
    // 使用 Vue Devtools Kit 获取页面的组件树
    const { getComponentTree } = await import('@vue/devtools-kit')
    return getComponentTree(page.$vm)
  },
  
  async getComponentInstance(id: string) {
    // 从缓存中获取或遍历查找
    return this.componentCache.get(id) || await this.findComponentById(id)
  },
  
  // Pinia 相关
  async getPiniaStores() {
    const pinia = getCurrentPinia()
    if (!pinia) return []
    
    const stores = []
    for (const [id, store] of pinia._s) {
      stores.push({
        id,
        state: toRaw(store.$state),
        getters: extractGetters(store),
        actions: extractActions(store)
      })
    }
    
    return stores
  },
  
  // 路由相关
  async getRoutes() {
    // 从 pages.json 中读取
    const pagesJson = await this.readPagesJson()
    return pagesJson.pages.map(page => ({
      path: page.path,
      style: page.style,
      meta: page.meta
    }))
  },
  
  async getPageStack() {
    const pages = getCurrentPages()
    return pages.map((page, index) => ({
      index,
      route: page.route,
      options: page.options,
      $vm: page.$vm
    }))
  },
  
  async navigateTo(url: string, options?: NavigateOptions) {
    return new Promise((resolve, reject) => {
      uni.navigateTo({
        url,
        ...options,
        success: resolve,
        fail: reject
      })
    })
  },
  
  // 性能相关
  async getPerformanceMetrics() {
    const performance = uni.getPerformance()
    
    return {
      // 页面性能
      pageLoad: performance.getEntriesByType('navigation')[0],
      
      // 资源加载
      resources: performance.getEntriesByType('resource'),
      
      // 自定义指标
      custom: this.customMetrics
    }
  },
  
  async startProfiling(sessionId: string) {
    this.profilingSessions.set(sessionId, {
      startTime: Date.now(),
      events: []
    })
    
    // 开始收集性能数据
    this.startCollectingPerformanceData(sessionId)
  },
  
  async stopProfiling(sessionId: string) {
    const session = this.profilingSessions.get(sessionId)
    if (!session) {
      throw new Error(`Profiling session ${sessionId} not found`)
    }
    
    session.endTime = Date.now()
    this.stopCollectingPerformanceData(sessionId)
    
    return {
      sessionId,
      duration: session.endTime - session.startTime,
      events: session.events,
      summary: this.analyzeProfilingData(session)
    }
  },
  
  // 工具方法
  getServerURL() {
    // 开发环境：使用本地服务器
    if (process.env.NODE_ENV === 'development') {
      return 'ws://localhost:5173/__devframe__'
    }
    
    // 生产环境：使用配置的服务器地址
    return this.options.serverURL || 'ws://devtools.uni-helper.js.org'
  }
})
```

#### H5 适配器

```typescript
// packages/devtools-adapter/src/h5/index.ts
export const h5Adapter = createAdapter({
  name: 'h5',
  
  transport: {
    type: 'iframe',
    
    async connect() {
      // H5 环境可以直接嵌入 DevTools UI
      // 或者通过 iframe postMessage 通信
      
      if (window.parent !== window) {
        // 在 iframe 中，使用 postMessage
        return createIFrameTransport({
          target: window.parent,
          origin: '*'
        })
      } else {
        // 独立窗口，直接通信
        return createDirectTransport()
      }
    }
  },
  
  async getComponentTree() {
    // H5 环境可以直接访问 Vue 实例
    const app = getCurrentApp()
    const { getComponentTree } = await import('@vue/devtools-kit')
    return getComponentTree(app._instance)
  },
  
  // 其他方法类似小程序适配器
})
```

### 5.3 Inspector 核心实现

```typescript
// packages/devtools-inspector/src/component-inspector.ts
import { Inspector } from '@devframe/inspector'
import { parse, stringify } from '@vue/devtools-kit'

export class UniComponentInspector extends Inspector {
  private componentCache = new Map<string, any>()
  private treeCache: ComponentTree | null = null
  
  constructor(private adapter: PlatformAdapter) {
    super()
    this.setupWatchers()
  }
  
  // 设置监听器
  private setupWatchers() {
    this.adapter.on('componentAdded', (payload) => {
      this.invalidateTreeCache()
    })
    
    this.adapter.on('componentRemoved', (payload) => {
      this.componentCache.delete(payload.id)
      this.invalidateTreeCache()
    })
    
    this.adapter.on('componentUpdated', (payload) => {
      // 更新缓存
      const instance = this.componentCache.get(payload.id)
      if (instance) {
        this.updateInstanceCache(instance, payload)
      }
    })
  }
  
  // 获取组件树
  async getTree(): Promise<ComponentTree> {
    // 使用缓存
    if (this.treeCache) {
      return this.treeCache
    }
    
    const rawTree = await this.adapter.getComponentTree()
    const enrichedTree = await this.enrichTree(rawTree)
    
    this.treeCache = enrichedTree
    return enrichedTree
  }
  
  // 增强组件树（添加 Uni 特定信息）
  private async enrichTree(tree: RawComponentTree): Promise<ComponentTree> {
    const enriched: ComponentTree = {
      id: tree.id,
      name: tree.name,
      type: tree.type,
      
      // 添加文件信息
      file: tree.file || '',
      
      // 添加标签（用于分类）
      tags: this.extractTags(tree),
      
      // 添加 Uni 特定信息
      uni: {
        isPage: this.isPage(tree),
        isComponent: this.isComponent(tree),
        platform: this.adapter.name
      },
      
      // 递归处理子组件
      children: await Promise.all(
        (tree.children || []).map(child => this.enrichTree(child))
      )
    }
    
    return enriched
  }
  
  // 获取组件状态
  async getState(id: string): Promise<ComponentState> {
    const instance = await this.adapter.getComponentInstance(id)
    
    if (!instance) {
      throw new Error(`Component ${id} not found`)
    }
    
    // 缓存实例
    this.componentCache.set(id, instance)
    
    // 提取状态
    const state: ComponentState = {
      id,
      name: getComponentName(instance),
      type: getComponentType(instance),
      
      // 基础状态
      props: this.extractProps(instance),
      data: this.extractData(instance),
      computed: this.extractComputed(instance),
      
      // Composition API
      setup: this.extractSetupState(instance),
      
      // 其他
      refs: this.extractRefs(instance),
      slots: this.extractSlots(instance),
      emit: this.extractEmits(instance),
      lifecycle: this.extractLifecycle(instance),
      
      // Pinia
      pinia: this.extractPiniaState(instance)
    }
    
    return state
  }
  
  // 提取 Props
  private extractProps(instance: any): Record<string, any> {
    const props = {}
    
    if (instance.$options.props) {
      for (const key in instance.$options.props) {
        props[key] = {
          type: instance.$options.props[key].type?.name || 'any',
          value: stringify([instance[key]])[0],
          required: instance.$options.props[key].required,
          default: instance.$options.props[key].default
        }
      }
    }
    
    return props
  }
  
  // 提取 Data (Options API)
  private extractData(instance: any): Record<string, any> {
    if (!instance.$data) return {}
    
    const data = {}
    for (const key in instance.$data) {
      // 跳过内部属性
      if (key.startsWith('_') || key.startsWith('$')) continue
      
      data[key] = stringify([instance.$data[key]])[0]
    }
    
    return data
  }
  
  // 提取 Setup State (Composition API)
  private extractSetupState(instance: any): Record<string, any> {
    if (!instance.$.setupState) return {}
    
    const state = {}
    for (const key in instance.$.setupState) {
      const value = instance.$.setupState[key]
      
      // 跳过函数
      if (typeof value === 'function') continue
      
      // 处理 ref
      if (isRef(value)) {
        state[key] = {
          type: 'ref',
          value: stringify([value.value])[0]
        }
      }
      // 处理 reactive
      else if (isReactive(value)) {
        state[key] = {
          type: 'reactive',
          value: stringify([toRaw(value)])[0]
        }
      }
      // 普通值
      else {
        state[key] = stringify([value])[0]
      }
    }
    
    return state
  }
  
  // 更新组件状态
  async updateState(id: string, path: string, value: any): Promise<void> {
    const instance = this.componentCache.get(id)
    
    if (!instance) {
      throw new Error(`Component ${id} not found in cache`)
    }
    
    // 区分 Options API 和 Composition API
    if (isOptionsAPI(instance)) {
      await this.updateOptionsAPIState(instance, path, value)
    } else {
      await this.updateCompositionAPIState(instance, path, value)
    }
    
    // 触发更新
    instance.$forceUpdate()
    
    // 通知监听器
    this.emit('stateUpdated', { id, path, value })
  }
  
  // 更新 Options API 状态
  private async updateOptionsAPIState(
    instance: any,
    path: string,
    value: any
  ): Promise<void> {
    // 直接修改 $data
    setValueByPath(instance.$data, path, value)
  }
  
  // 更新 Composition API 状态
  private async updateCompositionAPIState(
    instance: any,
    path: string,
    value: any
  ): Promise<void> {
    const setupState = instance.$.setupState
    const keys = path.split('.')
    const key = keys[0]
    
    if (!(key in setupState)) {
      throw new Error(`Property ${key} not found in setup state`)
    }
    
    const binding = setupState[key]
    
    // 处理 ref
    if (isRef(binding)) {
      if (keys.length === 1) {
        binding.value = value
      } else {
        setValueByPath(binding.value, keys.slice(1).join('.'), value)
      }
    }
    // 处理 reactive
    else if (isReactive(binding)) {
      if (keys.length === 1) {
        Object.assign(binding, value)
      } else {
        setValueByPath(binding, keys.slice(1).join('.'), value)
      }
    }
    // 普通值（不可响应式修改）
    else {
      throw new Error(`Cannot update non-reactive binding: ${key}`)
    }
  }
  
  // 工具方法
  private extractTags(tree: any): string[] {
    const tags: string[] = []
    
    if (tree.isPage) tags.push('page')
    if (tree.isComponent) tags.push('component')
    if (tree.isKeepAlive) tags.push('keep-alive')
    if (tree.isFunctional) tags.push('functional')
    if (tree.isFragment) tags.push('fragment')
    
    return tags
  }
  
  private isPage(tree: any): boolean {
    return tree.type === 'page' || tree.name === 'Page'
  }
  
  private isComponent(tree: any): boolean {
    return tree.type === 'component'
  }
  
  private invalidateTreeCache(): void {
    this.treeCache = null
  }
}
```

### 5.4 UI 组件实现

```typescript
// packages/devtools-ui/src/components/ComponentTree.ts
import { defineCustomElement, html, css } from '@devframe/ui'

export const ComponentTree = defineCustomElement({
  name: 'uni-component-tree',
  
  props: {
    filter: String
  },
  
  state: {
    tree: null as ComponentTree | null,
    selectedId: null as string | null,
    expandedIds: new Set<string>()
  },
  
  styles: css`
    :host {
      display: block;
      height: 100%;
      overflow: auto;
    }
    
    .tree-node {
      padding-left: var(--indent, 0px);
      cursor: pointer;
      user-select: none;
    }
    
    .tree-node:hover {
      background: var(--hover-bg, #f0f0f0);
    }
    
    .tree-node.selected {
      background: var(--selected-bg, #e0e0e0);
    }
    
    .tree-node-label {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
    }
    
    .tree-node-arrow {
      transition: transform 0.2s;
    }
    
    .tree-node-arrow.expanded {
      transform: rotate(90deg);
    }
    
    .tree-node-name {
      font-family: monospace;
      font-size: 13px;
    }
    
    .tree-node-tag {
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 2px;
      background: var(--tag-bg, #ddd);
    }
  `,
  
  template: html`
    <div class="component-tree">
      ${() => this.renderTree(this.state.tree)}
    </div>
  `,
  
  async connected() {
    // 获取初始树
    const tree = await this.rpc.call('getComponentTree')
    this.state.tree = tree
    
    // 订阅树变化
    this.rpc.subscribe('onComponentTreeChange', (newTree) => {
      this.state.tree = newTree
      this.render()
    })
  },
  
  methods: {
    renderTree(node: ComponentTree | null, depth = 0): string {
      if (!node) return ''
      
      const hasChildren = node.children && node.children.length > 0
      const isExpanded = this.state.expandedIds.has(node.id)
      const isSelected = this.state.selectedId === node.id
      
      const indent = depth * 16
      
      return html`
        <div 
          class="tree-node ${isSelected ? 'selected' : ''}"
          style="--indent: ${indent}px"
        >
          <div 
            class="tree-node-label"
            @click=${() => this.handleNodeClick(node)}
          >
            ${hasChildren ? html`
              <span 
                class="tree-node-arrow ${isExpanded ? 'expanded' : ''}"
                @click.stop=${() => this.toggleExpand(node.id)}
              >
                ▶
              </span>
            ` : html`<span style="width: 12px"></span>`}
            
            <span class="tree-node-name">&lt;${node.name}&gt;</span>
            
            ${node.tags?.map(tag => html`
              <span class="tree-node-tag">${tag}</span>
            `)}
          </div>
          
          ${isExpanded && hasChildren ? html`
            <div class="tree-node-children">
              ${node.children.map(child => 
                this.renderTree(child, depth + 1)
              )}
            </div>
          ` : ''}
        </div>
      `
    },
    
    async handleNodeClick(node: ComponentTree) {
      this.state.selectedId = node.id
      this.render()
      
      // 获取组件状态
      const state = await this.rpc.call('getComponentState', node.id)
      
      // 触发事件
      this.emit('select', { node, state })
    },
    
    toggleExpand(id: string) {
      if (this.state.expandedIds.has(id)) {
        this.state.expandedIds.delete(id)
      } else {
        this.state.expandedIds.add(id)
      }
      this.render()
    }
  }
})
```

### 5.5 CLI 工具实现

```typescript
// packages/devtools-cli/src/commands/inspect.ts
import { defineCommand } from '@devframe/cli'
import { createDevframeClient } from '@devframe/client'
import { formatTree, formatJSON, formatHTML } from '../formatters'

export default defineCommand({
  name: 'inspect',
  description: 'Inspect Uni-App component tree',
  
  options: {
    format: {
      type: 'string',
      alias: 'f',
      choices: ['json', 'tree', 'html'],
      default: 'json',
      description: 'Output format'
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Output file path'
    },
    url: {
      type: 'string',
      alias: 'u',
      default: 'ws://localhost:5173/__devframe__',
      description: 'DevTools server URL'
    },
    filter: {
      type: 'string',
      description: 'Filter components by name'
    }
  },
  
  async handler({ format, output, url, filter }) {
    console.log('Connecting to DevTools server...')
    
    // 连接到 DevTools
    const client = await createDevframeClient({
      url,
      tool: '@uni-helper/devtools'
    })
    
    console.log('Connected. Fetching component tree...')
    
    // 获取组件树
    const tree = await client.call('getComponentTree')
    
    // 过滤
    const filteredTree = filter 
      ? filterTree(tree, filter)
      : tree
    
    // 格式化输出
    let formatted: string
    
    switch (format) {
      case 'tree':
        formatted = formatTree(filteredTree)
        break
      case 'html':
        formatted = formatHTML(filteredTree)
        break
      case 'json':
      default:
        formatted = formatJSON(filteredTree)
        break
    }
    
    // 输出
    if (output) {
      await writeFile(output, formatted)
      console.log(`Report saved to ${output}`)
    } else {
      console.log(formatted)
    }
    
    // 断开连接
    await client.disconnect()
  }
})

// 辅助函数
function filterTree(tree: ComponentTree, filter: string): ComponentTree {
  if (tree.name.includes(filter)) {
    return tree
  }
  
  if (tree.children) {
    const filteredChildren = tree.children
      .map(child => filterTree(child, filter))
      .filter(Boolean)
    
    if (filteredChildren.length > 0) {
      return {
        ...tree,
        children: filteredChildren
      }
    }
  }
  
  return null
}
```

---

## 6. 实施路线图

### Phase 1: 基础设施（2 weeks）

**目标**：搭建 Devframe 基础，不破坏现有功能

**任务清单**：

- [ ] Week 1: 项目结构和依赖
  - [ ] 创建新的 monorepo 结构
  - [ ] 安装 Devframe 相关依赖
  - [ ] 配置 TypeScript 和构建工具
  - [ ] 设置开发环境（热重载、调试等）
  - [ ] 编写基础类型定义

- [ ] Week 2: 基础 Devframe 定义
  - [ ] 创建空的 Devframe 定义
  - [ ] 实现基础的 RPC 桩方法
  - [ ] 创建最小化的 UI 组件
  - [ ] 测试基础连接和通信
  - [ ] 文档：开发者指南

**验收标准**：
- ✅ 可以启动 Devframe DevTools（即使功能为空）
- ✅ 可以连接到小程序环境
- ✅ 可以进行基础的 RPC 调用
- ✅ 构建流程正常工作

### Phase 2: 组件检查器（2 weeks）

**目标**：迁移核心的组件树查看和状态编辑功能

**任务清单**：

- [ ] Week 3: 组件树
  - [ ] 实现 `getComponentTree` RPC
  - [ ] 实现小程序适配器的组件树获取
  - [ ] 实现 ComponentTree UI 组件
  - [ ] 支持组件过滤和搜索
  - [ ] 测试：组件树正确显示

- [ ] Week 4: 组件状态
  - [ ] 实现 `getComponentState` RPC
  - [ ] 实现 `updateComponentState` RPC
  - [ ] 支持 Options API 组件
  - [ ] 支持 Composition API 组件
  - [ ] 实现 StateField UI 组件
  - [ ] 支持不同类型值的编辑（字符串、数字、布尔、对象等）
  - [ ] 测试：状态查看和编辑正常工作

**验收标准**：
- ✅ 可以查看完整的组件树
- ✅ 可以选中组件查看状态
- ✅ 可以编辑 Options API 组件的状态
- ✅ 可以编辑 Composition API 组件的状态
- ✅ 编辑后小程序实时更新

### Phase 3: Pinia 检查器（2 weeks）

**目标**：迁移 Pinia 状态管理功能

**任务清单**：

- [ ] Week 5: Pinia 集成
  - [ ] 实现 `getPiniaStores` RPC
  - [ ] 实现 `getPiniaState` RPC
  - [ ] 实现 `updatePiniaState` RPC
  - [ ] 实现 PiniaInspector UI 组件
  - [ ] 支持 store 列表查看

- [ ] Week 6: Pinia 高级功能
  - [ ] 支持 Pinia actions 调用
  - [ ] 支持 Pinia 时间旅行
  - [ ] 支持 Pinia 状态快照
  - [ ] 测试：Pinia 功能完整可用

**验收标准**：
- ✅ 可以查看所有 Pinia stores
- ✅ 可以查看和编辑 store 状态
- ✅ 可以调用 store actions
- ✅ 可以使用时间旅行功能

### Phase 4: 路由和页面（2 weeks）

**目标**：迁移 Uni 特定功能

**任务清单**：

- [ ] Week 7: 路由
  - [ ] 实现 `getRoutes` RPC
  - [ ] 实现 `navigateTo` RPC
  - [ ] 实现 RoutesInspector UI 组件
  - [ ] 支持路由跳转

- [ ] Week 8: 页面
  - [ ] 实现 `getPageStack` RPC
  - [ ] 实现 PagesInspector UI 组件
  - [ ] 支持页面栈查看
  - [ ] 支持页面跳转和返回
  - [ ] 测试：路由和页面功能正常

**验收标准**：
- ✅ 可以查看所有路由配置
- ✅ 可以查看当前页面栈
- ✅ 可以通过 DevTools 进行页面跳转
- ✅ 页面跳转后组件树正确更新

### Phase 5: 性能监控（2 weeks）

**目标**：迁移性能相关功能

**任务清单**：

- [ ] Week 9: 性能指标
  - [ ] 实现 `getPerformanceMetrics` RPC
  - [ ] 实现 PerformancePanel UI 组件
  - [ ] 支持页面加载性能查看
  - [ ] 支持资源加载性能查看

- [ ] Week 10: 性能分析
  - [ ] 实现 `startProfiling` RPC
  - [ ] 实现 `stopProfiling` RPC
  - [ ] 支持火焰图展示
  - [ ] 支持性能问题诊断
  - [ ] 测试：性能监控正常工作

**验收标准**：
- ✅ 可以查看实时性能指标
- ✅ 可以进行性能分析
- ✅ 可以查看火焰图
- ✅ 可以识别性能瓶颈

### Phase 6: CLI 和报告（2 weeks）

**目标**：新增 CLI 工具和静态报告功能

**任务清单**：

- [ ] Week 11: CLI 工具
  - [ ] 实现 `uni-devtools inspect` 命令
  - [ ] 实现 `uni-devtools diagnose` 命令
  - [ ] 支持不同输出格式（JSON、Tree、HTML）
  - [ ] 编写 CLI 文档

- [ ] Week 12: 静态报告
  - [ ] 实现 `uni-devtools report` 命令
  - [ ] 设计报告 HTML 模板
  - [ ] 支持交互式报告
  - [ ] 测试：CLI 和报告功能正常

**验收标准**：
- ✅ CLI 可以独立运行
- ✅ 可以生成组件树报告
- ✅ 可以运行诊断
- ✅ 可以生成静态 HTML 报告

### Phase 7: 测试和文档（2 weeks）

**目标**：完善测试覆盖和文档

**任务清单**：

- [ ] Week 13: 测试
  - [ ] 编写单元测试（目标：80% 覆盖率）
  - [ ] 编写集成测试
  - [ ] 编写 E2E 测试
  - [ ] 性能测试
  - [ ] 兼容性测试（不同小程序平台）

- [ ] Week 14: 文档
  - [ ] 用户文档
    - [ ] 快速开始
    - [ ] 功能介绍
    - [ ] 常见问题
  - [ ] 开发者文档
    - [ ] 架构设计
    - [ ] API 参考
    - [ ] 平台适配指南
  - [ ] 迁移指南（从 v1 到 v2）

**验收标准**：
- ✅ 测试覆盖率 > 80%
- ✅ 所有 E2E 测试通过
- ✅ 文档完整可用
- ✅ 有迁移指南

### Phase 8: Beta 发布和迭代（2 weeks）

**目标**：发布 beta 版本，收集反馈并迭代

**任务清单**：

- [ ] Week 15: Beta 发布
  - [ ] 发布 v2.0.0-beta.1
  - [ ] 在社区宣传
  - [ ] 收集早期用户反馈
  - [ ] 建立问题追踪

- [ ] Week 16: 迭代优化
  - [ ] 修复发现的 bug
  - [ ] 优化性能
  - [ ] 改进用户体验
  - [ ] 准备正式发布

**验收标准**：
- ✅ Beta 版本稳定运行
- ✅ 没有严重 bug
- ✅ 用户反馈积极
- ✅ 准备好正式发布

### 总时间：16 周（约 4 个月）

---

## 7. 风险评估与缓解

### 7.1 技术风险

#### 风险 1: Devframe 文档不足

**影响**：高  
**概率**：高

**描述**：Devframe 是一个新兴框架，文档可能不完善，缺少最佳实践和示例。

**缓解措施**：
1. **深入研究 Vite DevTools 源码**：Vite DevTools 是基于 Devframe 构建的，可以作为参考
2. **参与社区**：在 Devframe GitHub 提问，与维护者沟通
3. **逐步探索**：先实现简单功能，积累经验
4. **文档贡献**：将我们的实践经验贡献回 Devframe 文档

#### 风险 2: 小程序环境限制

**影响**：中  
**概率**：中

**描述**：小程序环境有很多限制（如 WebSocket 连接数、权限等），Devframe 可能未考虑这些限制。

**缓解措施**：
1. **早期验证**：在 Phase 1 就测试小程序环境的兼容性
2. **适配层设计**：设计灵活的适配层，隔离平台差异
3. **降级方案**：如果 WebSocket 不可用，可以使用轮询等降级方案
4. **反馈上游**：将小程序特定问题反馈给 Devframe 团队

#### 风险 3: 性能问题

**影响**：中  
**概率**：低

**描述**：Devframe 作为额外的抽象层，可能引入性能开销。

**缓解措施**：
1. **性能基准测试**：在每个 Phase 进行性能测试
2. **缓存策略**：合理使用缓存减少 RPC 调用
3. **按需加载**：UI 组件按需加载，不一次性加载所有功能
4. **性能监控**：持续监控性能指标

### 7.2 项目风险

#### 风险 4: 时间超期

**影响**：高  
**概率**：中

**描述**：16 周的时间可能不够，特别是遇到技术难题时。

**缓解措施**：
1. **MVP 优先**：先实现核心功能，非核心功能可以后续迭代
2. **时间缓冲**：每个 Phase 预留 20% 的缓冲时间
3. **里程碑检查**：每 2 周检查进度，及时调整计划
4. **减少范围**：如果时间不够，可以推迟部分功能到 v2.1

#### 风险 5: 破坏性变更

**影响**：高  
**概率**：低

**描述**：重写可能引入新的 bug，影响现有用户。

**缓解措施**：
1. **并行运行**：新旧版本并行，用户可以切换
2. **充分测试**：完整的测试覆盖
3. **渐进式迁移**：逐步迁移功能，不是一次性切换
4. **回滚计划**：如果出现严重问题，可以快速回滚

#### 风险 6: 用户接受度

**影响**：中  
**概率**：低

**描述**：用户可能不喜欢新的 UI 或工作流。

**缓解措施**：
1. **早期反馈**：Beta 阶段收集用户反馈
2. **保持一致**：UI 和交互尽量与旧版保持一致
3. **渐进式增强**：新功能可选，不强制用户使用
4. **迁移指南**：提供详细的迁移文档

### 7.3 生态风险

#### 风险 7: Devframe 项目不活跃

**影响**：高  
**概率**：低

**描述**：Devframe 可能停止维护，影响长期可持续性。

**缓解措施**：
1. **监控活跃度**：持续关注 Devframe 的更新频率和社区活跃度
2. **贡献代码**：积极参与 Devframe 社区，提高项目活跃度
3. **Fork 准备**：如果必要，准备 fork Devframe 继续维护
4. **抽象隔离**：核心逻辑与 Devframe 解耦，便于替换

---

## 8. 成功标准

### 8.1 功能完整性

- ✅ **组件检查器**
  - 可以查看完整的组件树
  - 可以查看和编辑组件状态
  - 支持 Options API 和 Composition API
  - 支持过滤和搜索

- ✅ **Pinia 检查器**
  - 可以查看所有 stores
  - 可以查看和编辑 store 状态
  - 可以调用 actions
  - 可以使用时间旅行

- ✅ **路由和页面**
  - 可以查看路由配置
  - 可以查看页面栈
  - 可以进行页面跳转

- ✅ **性能监控**
  - 可以查看实时性能指标
  - 可以进行性能分析
  - 可以生成火焰图

- ✅ **CLI 工具**
  - 可以独立运行
  - 可以生成报告
  - 可以进行诊断

### 8.2 质量标准

- ✅ **测试覆盖率** > 80%
- ✅ **性能**
  - RPC 调用延迟 < 100ms
  - UI 响应时间 < 200ms
  - 内存占用 < 50MB
- ✅ **兼容性**
  - 支持微信、支付宝、百度、头条、QQ 小程序
  - 支持 H5 和 App
- ✅ **稳定性**
  - 无严重 bug
  - 关键功能可用性 > 99.9%

### 8.3 用户体验

- ✅ **易用性**
  - 安装和配置简单（< 5 分钟）
  - UI 直观易懂
  - 有完整的文档和示例
- ✅ **可靠性**
  - 不影响应用性能
  - 连接稳定，自动重连
  - 错误提示清晰
- ✅ **灵活性**
  - 支持多种部署方式（浏览器扩展、独立应用、Vite 插件）
  - 支持自定义配置
  - 支持扩展插件

### 8.4 生态集成

- ✅ **Vite DevTools 集成**
  - 可以作为 Vite DevTools 的插件
  - 与其他 Vite 工具协同工作
- ✅ **AI Agent 支持**
  - 提供标准化的 API
  - 可以被 AI 编码代理访问
- ✅ **社区认可**
  - GitHub stars > 200
  - npm 下载量 > 1000/月
  - 有积极的社区反馈

---

## 9. 结论

基于 Devframe 重写 uni-helper-devtools 是一个雄心勃勃的计划，但收益是明显的：

**短期收益**：
- ✅ 更标准化的架构
- ✅ 更好的代码质量
- ✅ 更容易维护

**长期收益**：
- ✅ 支持更多平台（H5、App 等）
- ✅ 集成到 Vite DevTools 生态
- ✅ 为 AI 辅助调试做准备
- ✅ 更好的社区支持和可持续性

**建议的行动计划**：

1. **立即开始 Phase 1**（基础设施搭建）
2. **每 2 周一次里程碑检查**
3. **保持与社区的沟通**（Devframe、Vite、Uni-App）
4. **文档优先**（每个功能都要有文档）
5. **测试驱动**（每个功能都要有测试）

**最终目标**：

> 让 uni-helper-devtools 成为 Uni-App 开发者的首选调试工具，并成为 Devframe 生态的标杆项目。

---

## 附录

### A. 术语表

| 术语 | 说明 |
|-----|------|
| **Devframe** | 框架中立的 DevTools 基础设施 |
| **RPC** | Remote Procedure Call，远程过程调用 |
| **Transport** | 通信层，负责数据传输 |
| **Adapter** | 平台适配器，隔离平台差异 |
| **Inspector** | 检查器，负责数据采集和处理 |
| **Web Components** | Web 标准的组件技术 |
| **Composition API** | Vue 3 的组合式 API |
| **Options API** | Vue 2 的选项式 API |

### B. 参考资源

- [Devframe 官网](https://devfra.me/)
- [Devframe GitHub](https://github.com/devframes/devframe)
- [Vite DevTools](https://devtools.vite.dev/)
- [Vue DevTools Kit](https://github.com/vuejs/devtools-next)
- [Uni-App 文档](https://uniapp.dcloud.net.cn/)

### C. 相关文档

- [当前架构文档](./ARCHITECTURE.md)
- [API 参考](./API.md)
- [贡献指南](./CONTRIBUTING.md)

---

**文档版本**：1.0.0  
**最后更新**：2026-09-30  
**维护者**：Uni-Helper Team
