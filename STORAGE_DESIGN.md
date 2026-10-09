# 微信小程序 Storage 收集技术方案

> 讨论 ID: D-f9e0d8  
> 参与者: Claude Code, Antigravity  
> 日期: 2026-10-09

## 一、方案概述

为 uni-helper-devtools 设计微信小程序 Storage 收集能力，采用"按需主动拉取 / RPC 查询"模式，在 RPC/MCP 核心层实现，UI 面板零侵入，保持官方 Client 的对齐性与轻量度。

### 核心原则

1. **按需拉取，不做持续推送** - 避免性能开销和通道阻塞
2. **UI 面板零侵入** - 不在官方 Client 开发 Storage 展示组件
3. **MCP 优先暴露** - 为 AI Agent 提供开箱即用的调试能力
4. **轻量缓存 + 实时查询** - 平衡性能与一致性
5. **多平台扩展预留** - 抽象接口支持未来多端适配

## 二、整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      AI Agent / MCP                      │
│          (通过 MCP Tools 调用 Storage 查询)                │
└────────────────────┬────────────────────────────────────┘
                     │ MCP Tool Call
                     ↓
┌─────────────────────────────────────────────────────────┐
│                  packages/core (Core 层)                 │
│  - 注册 DevFrame RPC: get-storage-info, get-storage-entries │
│  - 轻量 keys 列表缓存 (TTL: 1-2秒, 可拦截失效)              │
└────────────────────┬────────────────────────────────────┘
                     │ DevFrame RPC
                     ↓
┌─────────────────────────────────────────────────────────┐
│             packages/probes (探针层)                      │
│  - runtime/storage.ts: StorageCapability 实现             │
│  - 拦截 uni.setStorage/removeStorage (清除缓存标记)       │
│  - 按需调用 uni.getStorageInfo + 并发 uni.getStorage     │
│  - 单条 Value 截断 (maxValueChars: 32KB)                 │
│  - safeSerialize 安全过滤                                │
└─────────────────────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              微信小程序运行时 (uni API)                    │
│  - uni.getStorageInfo()                                  │
│  - uni.getStorage(key)                                   │
│  - uni.setStorage(key, value)                            │
│  - uni.removeStorage(key)                                │
└─────────────────────────────────────────────────────────┘
```

## 三、核心接口设计

### 3.1 RPC 接口定义

#### 接口 1: `get-storage-info`

**用途**: 查询 Storage 元数据（keys 列表、容量信息）

```typescript
interface GetStorageInfoParams {
  // 无参数，返回全部元数据
}

interface StorageInfoResult {
  keys: string[] // 所有 key 的列表
  currentSize: number // 当前已用容量 (bytes)
  limitSize: number // 总容量限制 (bytes, 微信为 10MB)
  keyCount: number // key 总数
  timestamp: number // 查询时间戳
}

// RPC 方法签名
type GetStorageInfo = () => Promise<StorageInfoResult>
```

**实现要点**:

- 调用 `uni.getStorageInfo()` 获取元数据
- Core 层缓存此结果（TTL: 1-2秒），减少重复查询
- 拦截写操作时清除缓存

#### 接口 2: `get-storage-entries`

**用途**: 按需查询键值对，支持分片、过滤、截断

```typescript
interface GetStorageEntriesParams {
  keys?: string[] // 精确指定要查询的 keys（优先级最高）
  matchPattern?: string // 正则匹配模式（如 "^user_.*"）
  offset?: number // 分页偏移量（默认 0）
  limit?: number // 单次返回上限（默认 50，最大 200）
  maxValueChars?: number // 单条 Value 最大字符数（默认 32768 = 32KB）
  includeSize?: boolean // 是否返回每条的字节大小（默认 false）
}

interface StorageEntry {
  key: string // 键
  value: unknown // 值（自动 JSON.parse）
  size?: number // 字节大小（可选）
  truncated?: boolean // 是否被截断
  error?: string // 取值失败的错误信息
}

interface StorageEntriesResult {
  entries: StorageEntry[] // 键值对数组
  total: number // 符合条件的总数
  hasMore: boolean // 是否还有更多数据
  timestamp: number // 查询时间戳
}

// RPC 方法签名
type GetStorageEntries = (
  params: GetStorageEntriesParams,
) => Promise<StorageEntriesResult>
```

**实现要点**:

- 先调用 `get-storage-info` 获取 keys 列表（复用缓存）
- 根据 `keys` / `matchPattern` 过滤目标 keys
- 应用 `offset` / `limit` 分页
- 并发调用异步 `uni.getStorage(key)` 拉取值
- 单条超过 `maxValueChars` 时截断并标记 `truncated: true`
- 使用 `safeSerialize` 过滤不可序列化对象
- 不缓存键值内容，保证实时一致性

### 3.2 接口使用示例

```typescript
// 示例 1: 查看所有 keys 和容量
const info = await rpc.call('get-storage-info')
console.log(`Total keys: ${info.keyCount}, Used: ${info.currentSize / 1024}KB`)

// 示例 2: 获取特定 keys 的值
const result1 = await rpc.call('get-storage-entries', {
  keys: ['userToken', 'userId', 'config'],
})

// 示例 3: 正则匹配所有 user_ 开头的 keys
const result2 = await rpc.call('get-storage-entries', {
  matchPattern: '^user_',
  limit: 20,
})

// 示例 4: 分页获取所有数据
const result3 = await rpc.call('get-storage-entries', {
  offset: 0,
  limit: 50,
  maxValueChars: 10240, // 限制单条 10KB
})
```

## 四、实现要点

### 4.1 探针层 (packages/probes/src/runtime/storage.ts)

#### 文件结构

```typescript
// storage.ts

import { resolveRuntimeUni } from './utils'

/**
 * Storage 能力抽象，支持多平台扩展
 */
export interface StorageCapability {
  getInfo(): Promise<StorageInfoResult>
  getEntries(params: GetStorageEntriesParams): Promise<StorageEntriesResult>
}

/**
 * 微信小程序 Storage 实现
 */
export class WechatStorageCapability implements StorageCapability {
  private uni: any

  constructor() {
    this.uni = resolveRuntimeUni()
    if (!this.uni) {
      throw new Error('uni is not available in current runtime')
    }
  }

  async getInfo(): Promise<StorageInfoResult> {
    return new Promise((resolve, reject) => {
      this.uni.getStorageInfo({
        success: (res: any) => {
          resolve({
            keys: res.keys || [],
            currentSize: res.currentSize || 0,
            limitSize: res.limitSize || 10 * 1024 * 1024, // 10MB
            keyCount: res.keys?.length || 0,
            timestamp: Date.now(),
          })
        },
        fail: (err: any) => reject(err),
      })
    })
  }

  async getEntries(
    params: GetStorageEntriesParams,
  ): Promise<StorageEntriesResult> {
    const info = await this.getInfo()
    let targetKeys = info.keys

    // 1. 按 keys 精确过滤
    if (params.keys && params.keys.length > 0) {
      targetKeys = targetKeys.filter((k) => params.keys!.includes(k))
    }
    // 2. 按正则匹配过滤
    else if (params.matchPattern) {
      const regex = new RegExp(params.matchPattern)
      targetKeys = targetKeys.filter((k) => regex.test(k))
    }

    const total = targetKeys.length

    // 3. 应用分页
    const offset = params.offset || 0
    const limit = Math.min(params.limit || 50, 200)
    const pagedKeys = targetKeys.slice(offset, offset + limit)

    // 4. 并发拉取值
    const maxValueChars = params.maxValueChars || 32768
    const entries = await Promise.all(
      pagedKeys.map((key) =>
        this.fetchStorageEntry(key, maxValueChars, params.includeSize),
      ),
    )

    return {
      entries,
      total,
      hasMore: offset + limit < total,
      timestamp: Date.now(),
    }
  }

  private async fetchStorageEntry(
    key: string,
    maxValueChars: number,
    includeSize?: boolean,
  ): Promise<StorageEntry> {
    return new Promise((resolve) => {
      this.uni.getStorage({
        key,
        success: (res: any) => {
          let value = res.data
          let truncated = false

          // 安全序列化检查
          try {
            const serialized = JSON.stringify(value)

            // 截断超长值
            if (serialized.length > maxValueChars) {
              value = serialized.substring(0, maxValueChars) + '...[truncated]'
              truncated = true
            }

            const entry: StorageEntry = {
              key,
              value: truncated ? value : res.data,
              truncated,
            }

            if (includeSize) {
              entry.size = new Blob([serialized]).size
            }

            resolve(entry)
          } catch (err) {
            // 不可序列化对象
            resolve({
              key,
              value: '[Unserializable Object]',
              error: (err as Error).message,
            })
          }
        },
        fail: (err: any) => {
          resolve({
            key,
            value: null,
            error: err.errMsg || 'Failed to get storage',
          })
        },
      })
    })
  }
}

/**
 * Storage 运行时工具函数
 */
export function safeSerialize(value: any): any {
  try {
    // 检查是否可 JSON 序列化
    JSON.stringify(value)
    return value
  } catch {
    return '[Unserializable]'
  }
}

/**
 * 注册 Storage 探针
 */
export function setupStorageProbe() {
  const capability = new WechatStorageCapability()

  // 注册 RPC 方法到 AGENT_BASE_RPC
  globalThis.__UNI_DEVTOOLS_RPC__.register('get-storage-info', async () => {
    return capability.getInfo()
  })

  globalThis.__UNI_DEVTOOLS_RPC__.register(
    'get-storage-entries',
    async (params) => {
      return capability.getEntries(params)
    },
  )

  // 拦截写操作，清除 Core 层缓存标记
  interceptStorageWrites()
}

/**
 * 拦截 Storage 写操作
 */
function interceptStorageWrites() {
  const uni = resolveRuntimeUni()
  if (!uni) return

  const originalSet = uni.setStorage
  const originalRemove = uni.removeStorage
  const originalClear = uni.clearStorage

  // 拦截 setStorage
  uni.setStorage = function (options: any) {
    const result = originalSet.call(this, options)
    notifyCacheInvalidation()
    return result
  }

  // 拦截 removeStorage
  uni.removeStorage = function (options: any) {
    const result = originalRemove.call(this, options)
    notifyCacheInvalidation()
    return result
  }

  // 拦截 clearStorage
  uni.clearStorage = function (options: any) {
    const result = originalClear.call(this, options)
    notifyCacheInvalidation()
    return result
  }
}

/**
 * 通知 Core 层缓存失效
 */
function notifyCacheInvalidation() {
  globalThis.__UNI_DEVTOOLS_RPC__.emit('storage-cache-invalidate', {
    timestamp: Date.now(),
  })
}
```

### 4.2 Core 层缓存机制 (packages/core)

```typescript
// packages/core/src/storage-cache.ts

interface CachedStorageInfo {
  data: StorageInfoResult
  expireAt: number
}

class StorageInfoCache {
  private cache: CachedStorageInfo | null = null
  private readonly TTL = 2000 // 2秒 TTL

  constructor() {
    // 监听探针的缓存失效通知
    this.listenInvalidation()
  }

  get(): StorageInfoResult | null {
    if (!this.cache) return null
    if (Date.now() > this.cache.expireAt) {
      this.cache = null
      return null
    }
    return this.cache.data
  }

  set(data: StorageInfoResult) {
    this.cache = {
      data,
      expireAt: Date.now() + this.TTL,
    }
  }

  invalidate() {
    this.cache = null
  }

  private listenInvalidation() {
    // 监听探针发来的 storage-cache-invalidate 事件
    rpcClient.on('storage-cache-invalidate', () => {
      this.invalidate()
    })
  }
}

export const storageInfoCache = new StorageInfoCache()
```

### 4.3 MCP 工具暴露 (packages/mcp)

```typescript
// packages/mcp/src/tools/storage.ts

export const storageTools = [
  {
    name: 'get-storage-info',
    description:
      'Get WeChat Mini Program Storage metadata (keys list, capacity)',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
    handler: async () => {
      // 优先使用缓存
      const cached = storageInfoCache.get()
      if (cached) return cached

      const result = await rpcClient.call('get-storage-info')
      storageInfoCache.set(result)
      return result
    },
  },
  {
    name: 'get-storage-entries',
    description:
      'Query WeChat Mini Program Storage key-value pairs with filtering, pagination, and truncation',
    inputSchema: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific keys to query',
        },
        matchPattern: {
          type: 'string',
          description: 'Regex pattern to match keys (e.g., "^user_")',
        },
        offset: {
          type: 'number',
          description: 'Pagination offset (default: 0)',
        },
        limit: {
          type: 'number',
          description: 'Max entries to return (default: 50, max: 200)',
        },
        maxValueChars: {
          type: 'number',
          description: 'Max characters per value (default: 32768)',
        },
        includeSize: {
          type: 'boolean',
          description: 'Include byte size for each entry (default: false)',
        },
      },
    },
    handler: async (params: GetStorageEntriesParams) => {
      return rpcClient.call('get-storage-entries', params)
    },
  },
]
```

## 五、性能优化策略

### 5.1 轻量缓存策略

- **仅缓存元数据**：keys 列表和容量信息（通常 < 10KB）
- **短 TTL**：1-2 秒过期，避免长时间脏读
- **主动失效**：拦截写操作立即清除缓存
- **不缓存键值**：保证每次查询的实时一致性

### 5.2 分片与截断

- **分页查询**：默认 `limit: 50`，最大 `200`，避免单次传输过大
- **单条截断**：`maxValueChars: 32KB`，防止超大对象阻塞 RPC 通道
- **标记截断**：`truncated: true` 告知调用方数据不完整

### 5.3 并发控制

- **异步并发拉取**：使用 `Promise.all` 并发调用 `uni.getStorage`
- **主线程保护**：微信小程序异步 API 不阻塞主线程
- **错误隔离**：单个 key 读取失败不影响其他 keys

### 5.4 网络与序列化优化

- **探针侧过滤**：在探针层执行正则匹配和分页，减少传输量
- **安全序列化**：`safeSerialize` 过滤不可序列化对象
- **按需查询**：只查询需要的 keys，避免全量拉取

## 六、扩展性设计

### 6.1 StorageCapability 抽象

```typescript
// 多平台扩展示例
export class AlipayStorageCapability implements StorageCapability {
  // 支付宝小程序 my.getStorageInfo / my.getStorage 实现
}

export class ByteDanceStorageCapability implements StorageCapability {
  // 字节小程序 tt.getStorageInfo / tt.getStorage 实现
}

// 工厂函数
export function createStorageCapability(): StorageCapability {
  if (typeof uni !== 'undefined') {
    return new WechatStorageCapability()
  } else if (typeof my !== 'undefined') {
    return new AlipayStorageCapability()
  } else if (typeof tt !== 'undefined') {
    return new ByteDanceStorageCapability()
  }
  throw new Error('No supported platform detected')
}
```

### 6.2 未来扩展方向

1. **Web localStorage 支持**：通过 `StorageCapability` 扩展 Web 平台
2. **变更事件推送**：可选的轻量变更通知（如 Token 刷新场景）
3. **批量写入能力**：提供 `set-storage-entries` 方法
4. **导入导出**：支持 Storage 数据的批量导入导出（调试场景）

## 七、风险与注意事项

### 7.1 性能风险

| 风险               | 缓解措施                               | 监控指标             |
| ------------------ | -------------------------------------- | -------------------- |
| 全量查询阻塞主线程 | 强制分页 + 截断，禁止无限制全量        | 单次查询耗时 < 200ms |
| 高频查询消耗性能   | Core 层短 TTL 缓存                     | QPS 监控             |
| 超大对象序列化失败 | `maxValueChars` 截断 + `safeSerialize` | 序列化错误率         |

### 7.2 数据一致性风险

| 风险           | 缓解措施                   | 适用场景         |
| -------------- | -------------------------- | ---------------- |
| 缓存脏读       | 仅缓存 keys，键值实时拉取  | 需要最新值的场景 |
| 拦截失效未通知 | RPC 事件通知 + 短 TTL 兜底 | 高频写入场景     |
| 并发写入竞态   | 按需查询不做写入，只读能力 | 只读调试场景     |

### 7.3 跨平台兼容性风险

| 平台         | 已知差异                          | 处理策略                 |
| ------------ | --------------------------------- | ------------------------ |
| 微信小程序   | 同步/异步 API 并存                | 优先使用异步 API         |
| 支付宝小程序 | API 命名差异 (`my.*`)             | `StorageCapability` 抽象 |
| 字节小程序   | 容量限制可能不同                  | 动态读取 `limitSize`     |
| Web 平台     | 同步 API (`localStorage.getItem`) | 包装为 Promise           |

### 7.4 安全风险

- **敏感数据暴露**：Storage 可能包含 Token、密码等敏感信息
  - 缓解：MCP 工具需要明确的用户授权
  - 建议：提供 `excludeKeys` 参数过滤敏感 keys
- **不可信序列化内容**：探针返回的数据需要验证
  - 缓解：Core 层二次验证数据结构
  - 建议：限制单次传输大小上限（如 5MB）

## 八、实施路线图

### Phase 1: MVP 实现（1-2 周）

- [ ] 探针层实现 `WechatStorageCapability`
- [ ] 实现两个核心 RPC 接口
- [ ] Core 层轻量缓存机制
- [ ] MCP 工具暴露
- [ ] 基础单元测试

### Phase 2: 性能优化（1 周）

- [ ] 写操作拦截与缓存失效
- [ ] 并发拉取优化
- [ ] 单条截断机制
- [ ] 性能基准测试

### Phase 3: 多平台支持（1-2 周）

- [ ] 抽象 `StorageCapability` 接口
- [ ] 支付宝小程序适配
- [ ] 字节小程序适配
- [ ] Web localStorage 适配

### Phase 4: 增强能力（可选）

- [ ] 变更事件推送
- [ ] 批量写入能力
- [ ] 导入导出工具
- [ ] UI 面板可选展示

## 九、验收标准

### 9.1 功能验收

- [ ] 能够通过 MCP 工具查询 Storage 元数据
- [ ] 能够按 keys 精确查询键值对
- [ ] 能够使用正则匹配过滤 keys
- [ ] 能够分页查询大量数据
- [ ] 单条 Value 超长时正确截断并标记
- [ ] 写操作后缓存正确失效
- [ ] 不可序列化对象能够安全处理

### 9.2 性能验收

- [ ] 单次查询 50 条数据耗时 < 200ms（真机）
- [ ] 并发 10 个查询不阻塞主线程
- [ ] 缓存命中率 > 80%（高频查询场景）
- [ ] 内存占用 < 5MB（10MB Storage 场景）

### 9.3 一致性验收

- [ ] 键值查询返回的是最新值（非脏读）
- [ ] 写操作后 2 秒内缓存失效
- [ ] keys 列表与实际 Storage 一致

### 9.4 扩展性验收

- [ ] 新增平台支持无需修改 Core 层
- [ ] MCP 接口定义稳定，向后兼容

## 十、参考资料

- 讨论账本：`~/.seedmux/team/discussions/D-f9e0d8/ledger.md`
- Claude 方案：`~/.seedmux/team/discussions/D-f9e0d8/round-1/A.md`
- Agy 方案：`~/.seedmux/team/discussions/D-f9e0d8/round-1/B.md`
- Network 实现参考：`packages/probes/src/runtime/network.ts`
- RPC 类型定义：`packages/shared/src/types.ts`

---

**方案制定**: Claude Code (主持人), Claude (参与者 A), Antigravity (参与者 B)  
**最终版本**: v1.0  
**状态**: 待评审
