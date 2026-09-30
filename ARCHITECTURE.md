# Uni-Helper DevTools 架构设计与原理

## 目录

1. [项目概述](#项目概述)
2. [整体架构](#整体架构)
3. [核心模块](#核心模块)
4. [数据流](#数据流)
5. [技术栈](#技术栈)
6. [关键实现](#关键实现)
7. [通信机制](#通信机制)
8. [双向编辑原理](#双向编辑原理)

---

## 项目概述

Uni-Helper DevTools 是一个用于 uni-app 小程序开发的调试工具，类似于 Vue DevTools，提供了组件树查看、状态管理、实时数据编辑等功能。

### 设计目标

- 📊 **实时状态监控**：查看小程序组件的响应式数据
- ✏️ **双向编辑**：在 DevTools 中修改数据，小程序实时响应
- 🌳 **组件树可视化**：展示完整的组件层级结构
- 🔄 **热更新支持**：代码变更时自动更新
- 🎯 **零侵入**：通过 Vite 插件自动注入，无需手动修改代码

---

## 整体架构

项目采用 **客户端-服务器-小程序** 三层架构：

```
┌─────────────────┐         WebSocket (tRPC)        ┌─────────────────┐
│                 │ ◄────────────────────────────► │                 │
│   Browser UI    │                                 │  DevTools       │
│   (Client)      │         HTTP                    │  Server         │
│                 │ ◄────────────────────────────► │  (Node.js)      │
└─────────────────┘                                 └─────────────────┘
                                                            ▲
                                                            │
                                                     WebSocket (tRPC)
                                                            │
                                                            ▼
                                                    ┌─────────────────┐
                                                    │                 │
                                                    │   Mini Program  │
                                                    │   (WeChat/      │
                                                    │    Alipay)      │
                                                    └─────────────────┘
```

### 三层职责

1. **Browser UI (Client)**
   - 展示组件树和状态数据
   - 提供交互界面（搜索、过滤、编辑）
   - 发送更新请求

2. **DevTools Server**
   - 作为中间层，转发和存储数据
   - 管理多个客户端连接
   - 提供 HTTP 和 WebSocket 服务

3. **Mini Program**
   - 通过注入的代码收集运行时数据
   - 监听响应式数据变化
   - 接收并应用来自 DevTools 的更新

---

## 核心模块

### 1. Plugin 模块 (`packages/plugin`)

**作用**：Vite 插件，在构建时注入 DevTools 代码

#### 关键文件

```
packages/plugin/src/
├── index.ts                    # 插件入口
├── devtoolServer/              # 开发服务器
│   ├── index.ts               # 服务器启动
│   └── rpc/                   # tRPC 路由定义
│       ├── component.ts       # 组件相关 RPC
│       └── index.ts           # 路由合并
├── injects/                    # 代码注入逻辑
│   ├── injectMainFile.ts      # 注入到 main.ts
│   ├── injectPageFile.ts      # 注入到页面文件
│   └── injectVueFile.ts       # 注入到 Vue 组件
└── inspect/                    # 小程序端代码
    ├── trpc.js                # tRPC 客户端
    ├── setupProxy.js          # 数据代理和监听
    └── initMPClient.js        # 初始化逻辑
```

#### 注入流程

```javascript
// 1. Vite 插件拦截文件转换
transform(code, id) {
  // 2. 根据文件类型选择注入策略
  if (vueFilter(id)) {
    if (filterPages(id)) {
      // 页面文件：注入页面追踪
      code = injectPageFile(code, id).code
    }
    // 所有 Vue 文件：注入数据监听
    return injectDevtoolInfo(code, id)
  }
}

// 3. 注入后的代码示例
const bindings = { title, clickCount, userName, userAge }
setupProxy(bindings) // 监听所有响应式数据
```

### 2. Client 模块 (`packages/client`)

**作用**：浏览器端 UI，使用 Vue 3 + Vite 构建

#### 关键组件

```
packages/client/src/
├── pages/
│   └── components.vue         # 组件树页面
├── components/
│   ├── StateField.vue         # 状态字段展示（支持编辑）
│   └── tree/
│       └── TreeViewer.vue     # 树形结构展示
└── composables/
    └── trpc.ts                # tRPC 客户端配置
```

#### UI 架构

```vue
<template>
  <!-- 左侧：组件树 -->
  <TreeViewer 
    :data="componentTree" 
    @change="selectComponent" 
  />
  
  <!-- 右侧：状态展示 -->
  <StateField 
    v-for="(value, key) in componentData"
    :key="key"
    :data="value"
    :editable="true"
    @update="handleUpdate"
  />
</template>
```

### 3. Server 模块

**作用**：提供 WebSocket 和 HTTP 服务

#### 服务器架构

```javascript
// 使用 Polka (轻量级 Express) + WebSocket
const server = http.createServer()
const app = polka({ server })

// 静态文件服务
app.use(clientServe)  // 客户端 UI
app.use(inspectServe) // 检查工具

// tRPC 路由
app.use('/trpc', createExpressMiddleware({
  router: appRouter
}))

// WebSocket 支持
applyWSSHandler({
  wss: new ws.Server({ server }),
  router: appRouter
})
```

---

## 数据流

### 1. 数据上报流程（小程序 → DevTools）

```
小程序启动
  │
  ├─► initMPClient()
  │     └─► 注册 onShow 钩子
  │           └─► 收集组件树
  │                 └─► trpc.setComponentTree.subscribe(tree)
  │
  └─► setupProxy(bindings)
        └─► watch 每个 binding
              └─► 数据变化时
                    └─► trpc.sendComponentData.subscribe({ id, key, value })
                          │
                          ▼
                    DevTools Server
                          │
                          ├─► 存储到 componentData Map
                          └─► eventEmitter.emit('setComponentData', id)
                                │
                                ▼
                          Browser Client (订阅者)
                                │
                                └─► 更新 UI 显示
```

### 2. 数据更新流程（DevTools → 小程序）

```
Browser Client
  │
  └─► 用户双击编辑值
        └─► trpc.updateComponentData.mutate({ id, key, value })
              │
              ▼
        DevTools Server
              │
              └─► eventEmitter.emit('updateComponentData', { id, key, value })
                    │
                    ▼
              小程序 (订阅者)
                    │
                    └─► trpc.onUpdateComponentData.subscribe()
                          └─► 匹配 componentId
                                └─► binding.value = newValue
                                      │
                                      ▼
                                小程序 UI 自动更新
```

---

## 技术栈

### 前端（Browser Client）

- **框架**：Vue 3 (Composition API)
- **构建工具**：Vite
- **UI 组件**：@vue/devtools-ui
- **RPC 通信**：tRPC Client
- **样式**：UnoCSS

### 后端（DevTools Server）

- **运行时**：Node.js
- **Web 框架**：Polka (轻量级)
- **WebSocket**：ws
- **RPC 框架**：tRPC Server
- **类型校验**：Zod

### 小程序端

- **通信**：@trpc/client
- **WebSocket**：自定义 UniWebSocket 适配器
- **数据序列化**：@vue/devtools-kit

---

## 关键实现

### 1. 代码注入机制

#### 为什么需要注入？

小程序代码在微信/支付宝的沙箱环境中运行，无法直接访问外部调试工具。需要在构建时将 DevTools 代码注入到小程序中。

#### 注入时机

```javascript
// Vite 插件的 transform 钩子
export default function UniDevToolsPlugin() {
  return {
    name: 'uni-devtools',
    enforce: 'pre', // 在其他插件之前执行
    
    transform(code, id) {
      // 1. Vue 文件
      if (vueFilter(id)) {
        // 页面文件特殊处理
        if (filterPages(id)) {
          code = injectPageFile(code, id).code
        }
        // 注入 setupProxy
        return injectDevtoolInfo(code, id)
      }
      
      // 2. 主文件 (main.ts)
      if (filterMain(id)) {
        return injectMainFile(code)
      }
    }
  }
}
```

#### 注入内容

**主文件注入**：
```javascript
// 注入前
import { createSSRApp } from 'vue'

// 注入后
import { createSSRApp } from 'vue'
import { trpc, initMPClient, setCurrentPage } from '@uni-helper/devtools/inspect'

uni.$trpc = trpc
initMPClient()
```

**Vue 组件注入**：
```javascript
// 注入前
const title = ref('Hello')
const clickCount = ref(0)

// 注入后
const title = ref('Hello')
const clickCount = ref(0)

const bindings = { title, clickCount }
setupProxy(bindings) // 监听数据变化
```

### 2. 响应式数据监听

#### Vue 3 的响应式原理

Vue 3 使用 Proxy 实现响应式：

```javascript
const title = ref('Hello')
// 实际上 title 是一个对象：
// { value: 'Hello', __v_isRef: true }
```

#### setupProxy 实现

```javascript
export function setupProxy(bindings) {
  const trpc = uni.$trpc
  const componentId = getCurrentInstance().uid

  // 遍历所有 bindings
  for (const key in bindings) {
    // 使用 Vue 的 watch API 监听变化
    watch(
      () => bindings[key], // getter
      (newValue) => {
        // 序列化数据
        const serialized = stringify([newValue])
        
        // 发送到服务器
        trpc.sendComponentData.subscribe({
          id: componentId,
          key: key,
          value: serialized
        })
      },
      { deep: true, immediate: true } // 深度监听，立即执行
    )
  }
}
```

#### 数据序列化

使用 `@vue/devtools-kit` 的 `stringify` 函数：

```javascript
// 原始数据
const data = ref(123)

// 序列化后
stringify([data])
// 输出：'[[1],{"_custom":2},{"type":3,"stateTypeName":4,"value":5},"ref","Ref",123]'
```

这种格式可以保留：
- 数据类型（ref、reactive、computed）
- 值本身
- 元数据（用于 DevTools UI 渲染）

### 3. 组件树收集

#### 原理

利用 Vue 3 的组件实例 API 递归遍历：

```javascript
function extractComponentInfo(component) {
  const { type } = component.$
  
  // 基本信息
  const info = {
    name: type.fileName || 'App',
    file: type.filePath,
    id: component.$.uid, // Vue 组件唯一 ID
  }
  
  // 递归收集子组件
  if (component.$children?.length > 0) {
    info.children = component.$children
      .map(extractComponentInfo)
      .filter(c => c !== null)
  }
  
  return info
}

// 在页面 onShow 时调用
onShow(() => {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const vm = currentPage.$vm
  const tree = extractComponentInfo(vm)
  
  trpc.setComponentTree.subscribe(tree)
})
```

### 4. tRPC 通信协议

#### 为什么选择 tRPC？

- **类型安全**：TypeScript 端到端类型推导
- **自动序列化**：支持 JSON、二进制等格式
- **WebSocket 支持**：实时双向通信
- **简单易用**：无需定义 API schema

#### 路由定义

```typescript
// 服务器端
export function componentRouter(eventEmitter: EventEmitter) {
  return router({
    // Subscription：订阅式，持续推送数据
    onComponentData: publicProcedure
      .input(z.number()) // 输入验证
      .subscription(({ input }) => {
        return observable((emit) => {
          // 监听事件
          const handler = (id: number) => {
            if (input === id) {
              emit.next(componentData.get(id))
            }
          }
          eventEmitter.on('setComponentData', handler)
          
          // 清理函数
          return () => {
            eventEmitter.off('setComponentData', handler)
          }
        })
      }),
    
    // Mutation：单次请求-响应
    updateComponentData: publicProcedure
      .input(z.object({
        id: z.number(),
        key: z.string(),
        value: z.any(),
      }))
      .mutation(({ input }) => {
        eventEmitter.emit('updateComponentData', input)
      }),
  })
}
```

#### 客户端调用

```typescript
// 订阅数据
trpc.onComponentData.subscribe(componentId, {
  onData: (data) => {
    console.log('收到数据:', data)
  }
})

// 发送更新
trpc.updateComponentData.mutate({
  id: componentId,
  key: 'title',
  value: 'New Title'
})
```

### 5. WebSocket 适配器

#### 小程序 WebSocket 限制

小程序的 WebSocket API 与浏览器标准不同：

```javascript
// 浏览器标准
const ws = new WebSocket('ws://localhost:5015')
ws.addEventListener('message', handler)

// 小程序 API
uni.connectSocket({ url: 'ws://localhost:5015' })
uni.onSocketMessage(handler)
```

#### UniWebSocket 适配器

```javascript
export class UniWebSocket {
  constructor(url) {
    this.url = url
    this.readyState = 0 // CONNECTING
    
    uni.connectSocket({ url })
    
    uni.onSocketOpen(() => {
      this.readyState = 1 // OPEN
      this.onopen?.()
    })
    
    uni.onSocketMessage(({ data }) => {
      this.onmessage?.({ data })
    })
    
    uni.onSocketClose(() => {
      this.readyState = 3 // CLOSED
      this.onclose?.()
    })
  }
  
  send(data) {
    uni.sendSocketMessage({ data })
  }
  
  close() {
    uni.closeSocket()
  }
}
```

---

## 双向编辑原理

### 完整流程

```
1. 用户在 DevTools 中双击 "title: Hello"
   │
2. StateField.vue 进入编辑模式
   │
3. 用户修改为 "World" 并按 Enter
   │
4. saveEdit() 函数被调用
   │
   ├─► 类型转换（string/number/boolean）
   │
   └─► trpc.updateComponentData.mutate({
         id: 1,
         key: 'title',
         value: 'World'
       })
       │
       ▼
5. DevTools Server 接收请求
   │
   └─► eventEmitter.emit('updateComponentData', { id: 1, key: 'title', value: 'World' })
       │
       ▼
6. 小程序端监听到事件
   │
   └─► trpc.onUpdateComponentData.subscribe()
       │
       └─► 匹配 componentId === 1
           │
           └─► bindings['title'].value = 'World'
               │
               ▼
7. Vue 响应式系统自动更新 UI
   │
   └─► 小程序中的 <text>{{ title }}</text> 显示 "World"
```

### 关键代码

**客户端编辑逻辑**：
```typescript
// StateField.vue
function saveEdit() {
  let newValue: any = editValue.value
  
  // 类型转换
  if (dataType.value === 'number') {
    newValue = Number(editValue.value)
  } else if (dataType.value === 'boolean') {
    newValue = editValue.value.toLowerCase() === 'true'
  }
  
  // 发送更新
  trpc.updateComponentData.mutate({
    id: props.componentId,
    key: props.keyPath,
    value: newValue,
  })
}
```

**小程序接收更新**：
```javascript
// setupProxy.js
trpc.onUpdateComponentData.subscribe(undefined, {
  onData: (data) => {
    if (data.id === componentId && bindings[data.key]) {
      const binding = bindings[data.key]
      
      // 更新 ref 的值
      if (binding && typeof binding === 'object' && 'value' in binding) {
        binding.value = data.value
        console.log('Updated:', data.key, '=', data.value)
      }
    }
  }
})
```

### 为什么可以双向？

1. **Vue 3 响应式系统**
   - 修改 `ref.value` 会触发 Vue 的响应式更新
   - UI 自动重新渲染

2. **共享引用**
   ```javascript
   const title = ref('Hello')
   const bindings = { title } // 引用传递
   
   // setupProxy 中持有 bindings 引用
   // 修改 bindings['title'].value 等同于修改 title.value
   ```

3. **实时通信**
   - WebSocket 保持长连接
   - 数据变化立即推送，无需轮询

---

## 端口管理机制

### 问题

开发时端口可能被占用，自动切换端口会导致：
- 小程序连接到编译时的端口（如 5015）
- 服务器实际运行在另一个端口（如 5024）
- WebSocket 连接失败

### 解决方案

**严格端口模式**：如果配置的端口被占用，直接报错退出

```typescript
detectPort(port).then((availablePort) => {
  if (availablePort !== port) {
    console.error(`Port ${port} is already in use.`)
    console.error(`Kill the process: lsof -ti:${port} | xargs kill -9`)
    process.exit(1)
  }
  
  // 端口可用，启动服务器
  app.listen(port)
})
```

**配置方式**：
```typescript
// vite.config.ts
export default defineConfig({
  plugins: [
    DevTools({
      port: 5015, // 固定端口
    }),
  ],
})
```

---

## 性能优化

### 1. 数据序列化优化

**问题**：每次数据变化都序列化和传输，开销大

**优化**：
- 使用 `watch` 的 `deep` 选项，只在真正变化时触发
- 序列化结果缓存（可选）

### 2. UI 渲染优化

**问题**：大量组件和数据导致卡顿

**优化**：
- 虚拟滚动（可选）
- 懒加载子组件
- 防抖搜索：`watchDebounced(searchTerm, handler, { debounce: 300 })`

### 3. WebSocket 连接管理

**问题**：频繁断线重连

**优化**：
- 心跳检测
- 断线重连机制
- 连接池管理

---

## 安全考虑

### 1. 仅开发模式

DevTools **仅在开发模式下启用**：

```javascript
if (import.meta.env.DEV) {
  // 注入 DevTools 代码
}
```

生产构建会自动去除所有 DevTools 代码。

### 2. 本地网络限制

服务器只监听 `localhost`，无法从外部访问：

```javascript
app.listen(port, 'localhost')
```

### 3. 数据验证

使用 Zod 进行输入验证：

```typescript
.input(z.object({
  id: z.number(),
  key: z.string().max(100),
  value: z.any(),
}))
```

---

## 扩展性

### 添加新功能

1. **定义 RPC 接口**
   ```typescript
   // packages/plugin/src/devtoolServer/rpc/xxx.ts
   export function xxxRouter(eventEmitter) {
     return router({
       getData: publicProcedure.query(() => {
         return { data: 'xxx' }
       }),
     })
   }
   ```

2. **合并到主路由**
   ```typescript
   // packages/plugin/src/devtoolServer/rpc/index.ts
   return mergeRouters(
     routes,
     xxxRouter(eventEmitter),
   )
   ```

3. **客户端调用**
   ```typescript
   // packages/client/src/xxx.vue
   const data = await trpc.getData.query()
   ```

### 支持新平台

1. **实现 WebSocket 适配器**
2. **调整注入逻辑**
3. **测试兼容性**

---

## 总结

Uni-Helper DevTools 通过以下关键技术实现了强大的调试功能：

1. **Vite 插件**：在构建时自动注入代码
2. **Vue 响应式**：监听数据变化
3. **tRPC + WebSocket**：实时双向通信
4. **事件驱动架构**：解耦各个模块
5. **类型安全**：TypeScript 端到端

这种架构设计具有：
- ✅ **低侵入性**：无需手动修改业务代码
- ✅ **高性能**：WebSocket 实时通信
- ✅ **可扩展**：易于添加新功能
- ✅ **类型安全**：减少运行时错误
- ✅ **开发友好**：提供完善的调试体验

---

## 参考资源

- [Vue DevTools](https://devtools.vuejs.org/)
- [tRPC Documentation](https://trpc.io/)
- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [uni-app 开发文档](https://uniapp.dcloud.net.cn/)
