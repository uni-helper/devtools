# Uni DevTools 最终目录结构方案

## 核心结论

**不需要 agent 包**。AI agent 是外部独立项目，通过 devframe 的 MCP 协议消费数据。

---

## 推荐的目录结构

```text
packages/
├── shared/          # 跨端共享（协议类型、冻结契约常量、纯函数工具）
│   ├── types.ts
│   ├── constants.ts     # BINDINGS_PROP + AGENT_BASE_RPC(8) + AGENT_RPC_VUE3(5) + NODE_RPC
│   └── utils/network-merge.ts
│
├── probes/          # 小程序探针（复数，用户指定）
│   ├── vue3/        # Vue 3 + Pinia 入口（源码直发）
│   ├── vue2/        # Vue 2 入口（预构建 dist/agent-vue2.mjs，webpack4 消费）
│   ├── runtime/     # 采集逻辑：tree/state/push/network/pinia/render-code/…
│   └── socket/      # WebSocket 通道
│
├── core/            # Node 核心（中继 + RPC + 定义）
│   ├── devframe.ts  # DevframeDefinition（18 个 RPC，全部带 agent 元数据）
│   ├── relay.ts     # AgentRegistry 定向调用
│   ├── harness.ts / inspect-serve.ts
│   ├── rpc-names.ts # 组装探针方法名全表（放 node 侧的理由见 constants.ts 注释）
│   └── assets/panel # vendored 兜底面板产物
│
├── mcp/             # MCP 暴露面（用户指定独立成包）
│   └── src/index.ts # 路由策略 + stdio 入口 + fetch handler 包装
│
├── vite/            # Vite 插件 + 编译期插桩
│   ├── src/index.ts
│   └── src/instrument.ts
│
├── webpack/         # Webpack 插件
│   ├── src/index.ts
│   └── entry-loader.cjs
│
├── adapter/         # 协议适配器（854 行资产）
│   ├── uni-devtools-rpc.ts
│   └── mapping/
│
├── client/          # UI 面板（Vue DevTools UI）
│   ├── pages/ components/ composables/
│
└── devtools/        # 主入口门面
    └── src/index.ts + src/cli.ts   # @uni-helper/devtools（dev/build/mcp 三子命令）
```

**包数量**: 9 个（方案原文 8 个 + 用户指定新增的 `mcp`）

---

## 为什么不需要 agent 包？

### 1. devframe 已经内置 MCP 支持

```typescript
// packages/core/src/devframe.ts
uni.rpc.register(defineRpcFunction({
  name: 'get-component-tree',
  handler: async () => { /* 返回数据 */ },
  
  // 👇 这个字段自动暴露 MCP 接口
  agent: {
    description: 'Get component tree for AI analysis',
    input: (schema) => schema.object({ ... }),
    output: (schema) => schema.object({ ... })
  }
}))
```

### 2. MCP Adapter 自动处理

devframe 提供了专门的适配器：

```bash
# 自动生成 MCP 服务
npx @uni-helper/devtools mcp
```

会自动暴露所有带 `agent` 字段的 RPC 方法。

### 3. AI agent 是外部独立项目

```
┌────────────────────────────────┐
│  Uni DevTools（本项目）         │
│                                │
│  probe → core/devframe         │
│           ↓                    │
│       agent: { description }   │
│           ↓                    │
│       MCP Adapter（自动）       │
└───────────┬────────────────────┘
            │ MCP Protocol
            ▼
┌────────────────────────────────┐
│  外部 AI Agent（独立项目）      │
│  - Claude Desktop              │
│  - Cursor                      │
│  - 自定义 agent                │
└────────────────────────────────┘
```

---

## 数据流架构

### 人类开发者路径

```
probe（探针采集）
    ↓ WebSocket
core/relay（中继）
    ↓ RPC
adapter（协议翻译）
    ↓
client（Vue DevTools UI）
```

### AI agent 路径

```
probe（探针采集）
    ↓ WebSocket
core/relay（中继）
    ↓
core/devframe（RPC handler + agent 元数据）
    ↓
MCP Adapter（devframe 自动生成）
    ↓ Model Context Protocol
外部 AI agent（Claude Desktop / Cursor）
```

**关键点**：
- MCP Adapter 是 devframe 提供的，不需要自己实现
- AI agent 在外部独立项目中实现
- 本项目只负责暴露数据，不包含 AI 分析逻辑

---

## 各包职责

| 包名 | 职责 | 运行环境 | MCP 相关 |
|-----|------|---------|---------|
| **shared** | 跨端共享类型和工具 | 全环境 | - |
| **probe** | 小程序沙箱数据采集 | 小程序 | - |
| **core** | Node 中继 + RPC + **MCP 暴露** | Node.js | ✅ **包含 agent 元数据** |
| **adapter** | 协议翻译（给 client 用） | 浏览器 | - |
| **client** | UI 面板 | 浏览器 | - |
| **vite** | Vite 插件 | Node.js | - |
| **webpack** | Webpack 插件 | Node.js | - |
| **devtools** | 主入口 | Node.js | - |

---

## core 包的 MCP 实现

```typescript
// packages/core/src/devframe.ts

export function createUniDevtoolsDevframe(registry, options) {
  return defineDevframe({
    id: 'uni-helper-devtools',
    name: 'Uni DevTools',
    // ...
    
    async setup(ctx) {
      const uni = ctx.scope('uni-helper-devtools')
      
      // 注册 RPC 方法，带 agent 元数据
      uni.rpc.register(defineRpcFunction({
        name: 'get-component-tree',
        type: 'query',
        jsonSerializable: true,
        
        // 👇 这个字段自动暴露给 AI agent
        agent: {
          description: 'Get the component tree of running uni-app pages',
          input: (schema) => schema.object({
            pageId: schema.string().optional()
          }),
          output: (schema) => schema.object({
            pages: schema.array(schema.any()),
            vueVersion: schema.string()
          })
        },
        
        setup: () => ({
          handler: async (params) => {
            const tree = await registry.callAgent('uni-devtools:agent:getComponentTree')
            return {
              fetchedAt: Date.now(),
              pages: tree?.pages ?? [],
              vueVersion: tree?.vueVersion
            }
          }
        })
      }))
      
      // 更多 RPC 方法...
    }
  })
}
```

---

## 外部 AI Agent 使用示例

### Claude Desktop 配置

```json
// ~/.config/claude/config.json
{
  "mcpServers": {
    "uni-devtools": {
      "command": "npx",
      "args": ["@uni-helper/devtools", "mcp"]
    }
  }
}
```

### AI agent 调用

```typescript
// 外部项目（不在本仓库）
import { Client } from '@modelcontextprotocol/sdk'

const client = new Client({ name: 'my-analyzer' })
await client.connect(transport)

// 调用 DevTools 暴露的方法
const tree = await client.callTool({
  name: 'uni-helper-devtools:get-component-tree',
  arguments: { pageId: '/pages/index' }
})

// AI 自己分析
const issues = []
for (const component of tree.pages[0].components) {
  if (component.renderCount > 100) {
    issues.push({
      type: 'performance',
      message: `${component.name} renders too frequently`
    })
  }
}
```

---

## 与原作者建议的对比

| 维度 | 原作者建议 | 最终方案 | 说明 |
|-----|-----------|---------|------|
| 探针包 | `core` | `probe` | 避免混淆 |
| Node 核心 | 未明确 | `core` | 包含 MCP 暴露 |
| 适配器 | 未明确 | `adapter` | 1108 行资产保护 |
| 面板 | `client` | `client` | ✅ 一致 |
| agent 包 | "消费者" | ❌ **不创建** | **外部通过 MCP** |
| 包数量 | 6+ | 8 | 补充 core + webpack |

---

## 总结

### ✅ 核心设计

1. **probe** - 小程序探针，采集数据
2. **core** - Node 核心，暴露 MCP（通过 devframe 的 `agent` 字段）
3. **adapter** - 协议翻译，只给 client 用
4. **client** - UI 面板，人类开发者
5. **❌ 不需要 agent 包** - AI agent 在外部独立项目

### ✅ MCP 集成

- 在 `core/devframe.ts` 中通过 `agent: { description }` 暴露
- devframe 自动生成 MCP 服务
- 外部 AI agent 通过 MCP 协议消费
- **不需要自己实现 MCP Adapter**

### ✅ 职责清晰

```
本项目（DevTools）
└── 暴露数据（通过 MCP）

外部项目（AI Agent）
└── 消费数据 + 分析 + 生成建议
```

---

**最终答案：不需要 agent 包；`probes` / `core` / `adapter` / `client` / `shared` / `vite` / `webpack` / `mcp` / `devtools` 共 9 个包。**

---

## 实施结果（2026-10-06，分支 `refactor/packages-split`）

方案已按本文件落地，三处按用户指示偏离原文：

1. 探针包名用 **`probes`**（复数），不是 `probe`。
2. MCP **独立成 `packages/mcp`**，不塞进 core。该包是**接线包而非协议实现**——协议来自 devframe 的 `devframe/adapters/mcp`（底层可选 peer `@devframes/agentic`），这与本文件「MCP Adapter 不需要自己实现」一致。
3. 全量改名并同步仓内消费方（两个旧包名均未发布到 npm，无外部影响）。

实施中修正/发现的两点，已写进对应源码注释：

- **常量表必须拆成两张扁平表**。`shared/constants.ts` 不能导出 `{ ...AGENT_BASE_RPC, ...AGENT_RPC_VUE3 }` 这样的合并表：对象展开会让 esbuild 无法证明初始化无副作用，把整块（含 Pinia 键名）保留进 Vue 2 预构建产物，使「零 Vue 3 污染」的 `grep -ci pinia` 判据恒假阳性（实测 3 vs 0）。需要全表的 node 侧由 `core/src/rpc-names.ts` 自行组装。
- **MCP 与「绑 LAN IP」互相冲突**。插件为让真机探针能连，原先只绑 LAN IP；而 MCP 路由的 loopback peer 检查要求对端来自 loopback，两者不可能同时成立（实测三种请求全 403）。修法是把「绑定地址」与「对外地址」拆开：server 绑 `0.0.0.0`，探针/面板 URL 仍用 LAN IP 自己拼（devframe 会把 `0.0.0.0` 规范成 `localhost`，不能直接取 `started.origin`）。

