---
name: mp-weixin-e2e
description: Use when E2E-testing the uni-devtools mp-weixin integration in this repo — running the wxa-runner + Playwright suite in playground/vue3-vite/e2e, adding scenarios, or debugging probe component tree regressions (dead instances, duplicate IDs, leaks) and panel RPCs (state, Pinia, storage, network) after probe/adapter/build changes. Triggers: mp-weixin E2E, 小程序组件树, wxa-runner, dead instance, duplicate IDs, devtools 探针回归.
---

# MP-Weixin E2E Testing

用 [wxa-runner](https://open-wxa.github.io/wxa-runner/) 在 Chrome 里跑 playground 的 mp-weixin 编译产物（微信官方基础库），Playwright 驱动页面。探针经真实 WebSocket 连 sidecar，用例再用面板同款 devframe RPC 核对数据。**不需要微信开发者工具**，Linux CI 可跑（`.github/workflows/e2e.yml`）。

## Quick start

```bash
pnpm build                                   # 插件/探针/core 的 dist（playground 消费的是构建产物）
pnpm --filter vitesse-uni-app test:e2e       # 或在 playground/vue3-vite 下 pnpm test:e2e

# 只跑一部分 / 带界面调试
pnpm --filter vitesse-uni-app test:e2e -g "chaos"
pnpm --filter vitesse-uni-app test:e2e --headed      # 或 --ui
```

前置：本机装有 Google Chrome（没有就 `npx playwright install chrome`）。

`globalSetup`（`e2e/global-setup.ts`）自己拉起 `pnpm dev:mp-weixin`，等「Build complete」和面板 URL，解析出 sidecar 地址与 token，结束时关掉。已有构建在跑时可跳过拉起：

```bash
UNI_E2E_BASE_URL=http://127.0.0.1:<port>/__uni-devtools/ UNI_E2E_TOKEN=<token> pnpm test:e2e
```

拉起时设了 `UNI_DEVTOOLS_HOST=127.0.0.1`：探针按这个地址连 sidecar，不依赖局域网 IP，也避开 `localhost` 解析到 `::1` 时撞上别的进程（例如 vitest 插件占着同端口的 IPv6）。

## 文件

- `playground/vue3-vite/playwright.config.ts`：`workers: 1`（relay 只认最新连上的探针，并行会互相抢占）
- `e2e/fixtures.ts`：worker 级 `rpc` fixture（devframe client）、`verifyTree`、`tap`
- `e2e/component-tree.spec.ts`：增删/切换/复位、快速切换、chaos（固定种子）、跳转与返回
- `e2e/panels.spec.ts`：navigate-to、组件状态读写、Pinia、Storage、Network

## 组件树判据（`verifyTree`）

每一步之后，等 relay 快照与逻辑层收敛（探针推送有防抖，最多 10s），再断言：

1. relay 快照（`get-component-tree`）无重复节点 id
2. relay 页面栈 === 逻辑层 `getCurrentPages()`
3. relay 节点数 === 逻辑层按探针同款规则遍历的存活实例数（不等 = 死实例泄漏或遍历规则漂移）
4. 同页存活实例 uid 不撞车

逻辑层在 wxa-runner 的 `/__wxa__/appservice.html` frame 里，`verifyTree` 在那里 `evaluate`。遍历规则与 `packages/probes/src/runtime/tree.ts` 对齐：mp 下 `subTree` 为空，`internal.ctx.$children` 是唯一路径；`isUnmounted` / `_isDestroyed` 的实例连同子树剪掉；`maxDepth` 10。

注意：`$children` 链上的**死实例滞留是预期行为**（uni-mp-vue 卸载从不清链），探针负责过滤——遍历时剪掉，不要当失败。

## 写用例的约定

- 从 `./fixtures` 导入 `test` / `expect`（它扩展了 `@open-wxa/wxa-runner-playwright`），不要直接用 `@playwright/test`
- 按按钮文字点击（`tap(miniProgram, '隐藏 TreeGroup')`），场景页按钮 label 就是契约；改 label 要同步改用例
- 不要断言页面 data（`toHavePageData` / `pageData()`）：Vue 3 编译后字段名是短名，与源码不一致。断言可见文字、`toHavePath`、RPC 返回
- 外网请求用 `miniProgram.route` 拦下；未拦的请求在 CI 上会真实发出
- 用例结束时 fixture 会检查 `miniProgram.errors()` 为空（运行时错误、调用了未实现的 wx API）

## Debugging

- **失败现场**：`--headed` / `--ui` 看页面；CI 上下载 `playwright-report` artifact（含 trace）
- **节点数不等**：先对比 `packages/probes/src/runtime/tree.ts` 与 `instance.ts` 的过滤逻辑，再看推送防抖
- **连接 sidecar 超时 / unauthorized**：`UNI_E2E_TOKEN` 必须来自当前那次构建的日志
- **改了 workspace 源码不生效**：playground 消费的是 `packages/*/dist`，先 `pnpm build`；探针 vue3 入口走源码，`touch src/main.ts` 触发重构建
- **本地与 CI 结果不一致**：CI 只有 wxa-runner 内置基础库 3.7.0，用 `WXA_BASELIB=3.7.0 pnpm test:e2e` 复现

## 限制

- 只覆盖 Vue 3 线（wxa-runner 只验证过 Vue 3 的 uni-app）；Vue 2 探针产物 `agent-vue2.js` 由 `packages/probes` 的单测覆盖
- 预览、上传、真机调试仍需微信开发者工具
