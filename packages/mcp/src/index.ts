/**
 * Uni DevTools 的 MCP 暴露面。
 *
 * **本包不实现 MCP 协议。** 协议实现（Streamable-HTTP 路由、stdio 服务、工具与
 * 资源的注册与序列化）由 devframe 的 `devframe/adapters/mcp` 提供，底层是可选
 * peer `@devframes/agentic`。本包只负责把它接到我们的 DevframeDefinition 上，
 * 并固定两件属于「我们的产品决策」的事：
 *
 * 1. **路由设置**：宿主（Vite / Webpack 插件、harness、CLI）一律传 `MCP_SETTING`，
 *    让 devframe 在 agent surface 非空时自动挂 `<base>__mcp`。18 个 RPC 全部带
 *    `agent: { description }`（见 core 的 `devframe.ts`），所以 surface 恒非空。
 * 2. **stdio 入口**：给 Claude Desktop / Cursor 这类只能起子进程的客户端用。
 *
 * 两种用法的能力边界（实测口径，不要按想象宣传）：
 *
 * | 用法 | 实时探针数据 | 说明 |
 * | --- | --- | --- |
 * | dev server 路由（推荐） | ✅ | 探针连着同一个 sidecar，工具调用直达运行时 |
 * | stdio 子进程 | ❌ | 独立进程，没有中继；只有 node 本地 RPC 有真实结果 |
 *
 * stdio 下 `get-registered-routes`（解析 pages.json）与 `get-inspect-status`
 * （读 vite-plugin-inspect 落盘）**不依赖探针**，可直接应答；组件树 / 状态 /
 * Pinia / Network 这些需要探针的会如实报「No uni-devtools agent connected」，
 * 不是静默返回空数据。
 */
import process from 'node:process'
import { createMcpFetchHandler, createMcpServer } from 'devframe/adapters/mcp'
import type { CreateMcpFetchHandlerOptions, McpFetchHandler } from 'devframe/adapters/mcp'
import { AgentRegistry } from '@uni-helper/devtools-core/relay'
import { createUniDevtoolsDevframe } from '@uni-helper/devtools-core'

/** MCP 路由挂在 devframe 挂载基准之下的路径段（`<base>__mcp`） */
export const MCP_ROUTE_SUFFIX = '__mcp'

/**
 * 传给 dev server / hub / CLI 的 MCP 设置。
 *
 * `'auto'` = agent surface 非空且装了 `@devframes/agentic` 就挂路由；否则静默不挂。
 * 不用 `true`：那会在缺 peer 时直接抛 DF0079，把一个可选能力变成启动硬失败。
 */
export const MCP_SETTING = 'auto' as const

export interface McpStdioOptions {
  /** 面板 SPA 目录覆盖（默认按 core 的 resolveClientAssets 推断） */
  clientAssets?: string
}

/**
 * 起一个 stdio MCP 服务（`npx @uni-helper/devtools mcp` 的实现）。
 *
 * 进程内自建一个 registry 与 Definition，**不起中继**——所以它拿不到实时探针
 * 数据（见模块头的能力边界表）。要实时数据请让 MCP 客户端连 dev server 的
 * `__mcp` 路由。
 *
 * stdout 是 MCP 的传输通道，因此本函数与它调用的链路**不得往 stdout 写任何
 * 非协议内容**；诊断信息一律走 stderr。
 */
export async function serveUniDevtoolsMcpStdio(options: McpStdioOptions = {}): Promise<void> {
  const registry = new AgentRegistry()
  const def = createUniDevtoolsDevframe(registry, { clientAssets: options.clientAssets })

  process.stderr.write(
    '[uni-devtools] MCP stdio 已启动（无中继：只有 node 本地 RPC 有真实结果；'
    + '需要实时探针数据请改用 dev server 的 __mcp 路由）\n',
  )

  await createMcpServer(def, { transport: 'stdio' })
}

/**
 * 把 MCP 端点做成 `Request → Response` 的处理器，交给自定义宿主挂载。
 *
 * `ctx` 来自宿主自己的 `initDevframe` / `initHub` 上下文——本包不代替宿主初始化，
 * 避免同一定义被 `setup` 两次（那会把 registry 的中继绑定指向错误的 rpcGroup）。
 */
export function createUniDevtoolsMcpFetchHandler(
  ctx: Parameters<typeof createMcpFetchHandler>[0],
  options: Partial<CreateMcpFetchHandlerOptions> = {},
): McpFetchHandler {
  const mergedOptions: CreateMcpFetchHandlerOptions = {
    serverName: 'Uni DevTools',
    // 网络记录与组件树是 agent 最常读的共享状态，默认暴露
    exposeSharedState: true,
    ...options,
  } as CreateMcpFetchHandlerOptions
  return createMcpFetchHandler(ctx, mergedOptions)
}

export type { CreateMcpFetchHandlerOptions, CreateMcpServerOptions, McpFetchHandler, McpServerHandle } from 'devframe/adapters/mcp'
