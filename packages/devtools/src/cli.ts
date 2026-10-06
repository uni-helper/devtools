/**
 * `uni-devtools` CLI 入口。
 *
 * `createCac(def, { mcp: 'auto' })` 白拿三个子命令：
 *
 * ```
 * uni-devtools               # 起 dev server（含面板 + 探针中继 + MCP 路由）
 * uni-devtools build         # 静态报告
 * uni-devtools mcp           # stdio MCP（给 Claude Desktop / Cursor 这类只能起子进程的客户端）
 * ```
 *
 * 与 Vite / Webpack 插件路径的差别只在宿主：这里没有构建工具，
 * 探针需要自己把 wsUrl 指过来（`uni-devtools` 启动时打印）。
 */
import process from 'node:process'
import { createCac } from 'devframe/adapters/cac'
import { createUniDevtools } from './index.ts'

const { def } = createUniDevtools()

// stdout 在 `mcp` 子命令下是 MCP 的传输通道，日志一律走 stderr
const handle = createCac(def, {
  // 'auto'：agent surface 恒非空，装上 @devframes/agentic 后自动挂 <base>__mcp
  mcp: 'auto',
  onReady: ({ origin }) => {
    process.stderr.write(`[uni-devtools] dev server: ${origin}\n`)
  },
})

await handle.parse()
