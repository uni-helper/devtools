# 🔺🔹🔸🔻Uni DevTools

<pre align="center">
🏗 积极开发中💪，暂不建议在生产中使用
</pre>

</br>

<p align="center"><img  src=".github/assets/demo.png"></p>

## 安装

```bash
pnpm add -D @uni-helper/devtools
```

## 使用

```ts
import { defineConfig } from 'vite'
import Uni from '@dcloudio/vite-plugin-uni'
import DevTools from '@uni-helper/devtools'

export default defineConfig({
  plugins: [
    DevTools(),
    Uni(),
  ],
})
```

## 💻 开发

- `fork`并`clone`本仓库
- 使用`pnpm install`安装依赖
- 使用`pnpm dev`编译代码
- 使用`pnpm play`运行交互式测试

## 💝 贡献

任何人都可以参与到这个项目的贡献中，欢迎大家参与讨论和贡献代码。

## 🙇🏻‍♂️ [sponsors](https://afdian.com/a/flippedround)

<p align="center">
  <a href="https://afdian.com/a/flippedround">
    <img alt="sponsors" src="https://cdn.jsdelivr.net/gh/FliPPeDround/sponsors/sponsorkit/sponsors.svg"/>
  </a>
</p>
