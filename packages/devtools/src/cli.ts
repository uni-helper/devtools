/**
 * `uni-devtools` CLI 入口。
 *
 * ```
 * uni-devtools               # 起 dev server（含面板 + 探针中继 + MCP 路由）
 * uni-devtools build         # 静态报告
 * uni-devtools connect       # stdio MCP 网关：发现本机运行中的 dev server 并转发工具调用（推荐给 Agent）
 * uni-devtools mcp           # stdio MCP（独立进程，只有源码层面的工具有真实结果）
 * ```
 *
 * dev / build / mcp 来自 `createCac`，connect 是这里加的；mcp 的实现换成
 * `serveUniDevtoolsMcpStdio`，让拿不到探针数据的报错引导到 connect。
 *
 * 与 Vite / Webpack 插件路径的差别只在宿主：这里没有构建工具，
 * 探针需要自己把 wsUrl 指过来（`uni-devtools` 启动时打印）。
 */
import process from 'node:process'
import { createCac } from 'devframe/adapters/cac'
import { serveUniDevtoolsMcpStdio } from '@uni-helper/devtools-mcp'
import { createUniDevtools } from './index.ts'

const { def } = createUniDevtools()

// stdout 在 `mcp` / `connect` 子命令下是 MCP 的传输通道，日志一律走 stderr
const handle = createCac(def, {
  // 'auto'：agent surface 恒非空，装上 @devframes/agentic 后自动挂 <base>__mcp
  mcp: 'auto',
  onReady: ({ origin }) => {
    process.stderr.write(`[uni-devtools] dev server: ${origin}\n`)
  },
  configureCli: (cli) => {
    const mcp = cli.commands.find((command) => command.name === 'mcp')
    mcp!.description =
      'Start a standalone stdio MCP server (source-level tools only; use `connect` for live mini-program data)'
    mcp!.action(() => serveUniDevtoolsMcpStdio())

    cli
      .command(
        'connect',
        'Start a stdio MCP gateway to running Uni DevTools dev servers (live mini-program data)',
      )
      .action(async () => {
        // 跟随本包锁定的 devframe 版本，而不是让用户 `npx devframe connect` 临时拉最新版
        const { startConnectServer } =
          await import('@devframes/agentic/connect')
        await startConnectServer()
        process.stderr.write(
          '[uni-devtools] MCP connect 网关已启动：先调 devframe_connect_list-instances 按 rootDir 选实例，再用 devframe_connect_call-tool 调工具\n',
        )
      })
  },
})

await handle.parse()
