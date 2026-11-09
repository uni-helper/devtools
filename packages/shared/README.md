# @uni-helper/devtools-shared

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/uni-helper/devtools@main/logo.svg" alt="Uni DevTools logo" width="96" height="96">
</p>

Uni DevTools 的跨端共享层：node 侧（core / vite / webpack）与小程序探针共用的协议类型、冻结契约常量与纯函数工具。

## 安装

```bash
pnpm add -D @uni-helper/devtools-shared
```

一般不需要单独安装，作为其他包的依赖被自动带上；需要直接引用协议类型时再显式安装。

## 入口

| 导入路径                                          | 内容                    |
| ------------------------------------------------- | ----------------------- |
| `@uni-helper/devtools-shared`                     | 协议类型 + 冻结契约常量 |
| `@uni-helper/devtools-shared/utils/network-merge` | 网络记录合并            |
| `@uni-helper/devtools-shared/utils/mock-flag`     | 面板 `?mock` 判据       |
| `@uni-helper/devtools-shared/utils/tagged-value`  | 带类型标记的取值包装    |

纯 node 工具走子路径导出，不进主入口，否则会被探针构建整包引入。

## 约定

`constants.ts` 必须保持零 import：它同时进入 node 侧 bundle 和小程序构建，拖入 `node:*` 会直接炸掉小程序产物。写端与读端共用同一处常量，不要各自复制字面量。

## License

[MIT](https://github.com/uni-helper/devtools/blob/main/LICENSE)
