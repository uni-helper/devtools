# @uni-helper/devtools-mcp

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的 MCP 暴露面：把 Devframe 定义上的 agent surface 接成 Streamable HTTP 路由与 stdio 服务，让 AI Coding Agent 读写面板里的同一份运行时数据。

本包不实现 MCP 协议：协议实现来自 `devframe` 的 MCP adapter（底层是 `@devframes/agentic`），这里只固定路由设置与工具元数据。

一般不需要直接安装：[@uni-helper/devtools](https://www.npmjs.com/package/@uni-helper/devtools) 的 CLI 与 Vite / Webpack 插件已经接好。

## 入口

| 导入路径                   | 内容                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `@uni-helper/devtools-mcp` | `serveUniDevtoolsMcpStdio`、`createUniDevtoolsMcpFetchHandler`、`MCP_SETTING`、`MCP_ROUTE_SUFFIX` |

## 两种接入方式

- **推荐**：`npx @uni-helper/devtools connect`。stdio 网关从本机实例注册表发现运行中的 dev server，端口变了也不用改配置。
- **直连**：dev server 启动时在 `<base>__mcp` 挂 Streamable HTTP 路由，只接受本机请求（默认 `http://localhost:<端口>/__mcp`）。

独立的 `npx @uni-helper/devtools mcp` 进程连不到小程序，只有源码层面的工具能返回真实结果。

## 文档

Agent 接入步骤、工具列表与安全标注见 [根仓库 README 的 AI Agent 一节](https://github.com/uni-helper/devtools#ai-agent--mcp)。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
