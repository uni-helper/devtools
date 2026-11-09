# @uni-helper/devtools

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的门面包：装一个包就拿到 Vite / Webpack 插件、小程序探针、node 侧中继、浏览器面板与 MCP 暴露面，并自带 `uni-devtools` CLI。

## 安装

```bash
pnpm add -D @uni-helper/devtools
```

## 使用

**Vue 3 + Vite**：在 `vite.config.ts` 里注册 `UniDevtoolsPlugin`，放在 `Uni()` 之前。

```ts
import { defineConfig } from 'vite'
import Uni from '@dcloudio/vite-plugin-uni'
import { UniDevtoolsPlugin } from '@uni-helper/devtools'

export default defineConfig({
  plugins: [UniDevtoolsPlugin(), Uni()],
})
```

**Vue 2 + Webpack 4**：插件只提供 ESM 产物，`vue.config.js`（CommonJS）要用 [jiti](https://github.com/unjs/jiti) 加载，先 `pnpm add -D jiti`。

```js
const jiti = require('jiti')(__filename)
const { uniDevtoolsWebpack } = jiti('@uni-helper/devtools')

module.exports = {
  chainWebpack: (config) => {
    return uniDevtoolsWebpack(config)
  },
}
```

插件只在开发模式生效，生产构建不注入任何代码。编译启动后用浏览器打开控制台打印的面板地址即可。

## AI Agent 接入

在 MCP 客户端里加一份配置，`connect` 网关会自动发现本机运行中的 dev server：

```json
{
  "mcpServers": {
    "uni-devtools": {
      "command": "npx",
      "args": ["-y", "@uni-helper/devtools", "connect"]
    }
  }
}
```

CLI 子命令：`connect`（stdio MCP 网关，推荐）、`mcp`（独立 stdio，只支持源码层面的工具）、`dev`、`build`。

## 文档

插件选项（`port` / `host` / `auth`）、功能列表、已知限制与面板用法见 [uni-helper/devtools 仓库](https://github.com/uni-helper/devtools#readme)。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
