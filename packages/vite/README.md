# @uni-helper/devtools-vite

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的 Vite 插件：编译期给 uni-app 的小程序入口注入探针、给 SFC 插桩，并在 node 侧拉起 Devframe 伴生服务托管面板。

Vue 3 + Vite 工程。Vue 2 + Webpack 4 用 [@uni-helper/devtools-webpack](https://www.npmjs.com/package/@uni-helper/devtools-webpack)。

## 安装

```bash
pnpm add -D @uni-helper/devtools-vite
```

一般不需要单独安装：[@uni-helper/devtools](https://www.npmjs.com/package/@uni-helper/devtools) 已经带上它。

## 使用

把 `UniDevtoolsPlugin` 放在 `Uni()` 之前：

```ts
import { defineConfig } from 'vite'
import Uni from '@dcloudio/vite-plugin-uni'
import { UniDevtoolsPlugin } from '@uni-helper/devtools-vite'

export default defineConfig({
  plugins: [UniDevtoolsPlugin(), Uni()],
})
```

插件只在开发模式生效，生产构建不注入任何代码。编译启动后打开控制台打印的面板地址。

## 选项

`port`、`host`、`auth`（默认 `false`，开启后每次启动随机 token）以及对应的 `UNI_DEVTOOLS_PORT` / `UNI_DEVTOOLS_HOST` 环境变量，见 [根仓库 README 的配置一节](https://github.com/uni-helper/devtools#配置)。

## 文档

功能列表、AI Agent 接入与已知限制见 [uni-helper/devtools 仓库](https://github.com/uni-helper/devtools#readme)。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
