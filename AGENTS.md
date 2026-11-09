# devtools

uni-app 小程序的 DevTools：编译期往小程序里注入运行时探针，node 侧用 devframe 做中继与面板托管，浏览器里看组件树 / 组件状态 / Pinia / Vuex / 页面栈 / 网络请求 / Vite 构建管线，同一份数据再经 MCP 暴露给 AI Agent。支持 Vue 3 + Vite 与 Vue 2 + Webpack 4。

## 项目

- **语言**：TypeScript，`tsconfig.base.json` 开 `strict`，`noEmit` + `moduleResolution: bundler` + `allowImportingTsExtensions`，源码内部 import 带 `.ts` 后缀。
- **Node**：`.node-version` 钉 `24`，CI 用同一份文件。`core` / `shared` / `probes` / `adapter` 的 `exports` 指向 `src/*.ts`，仓库里包之间互相引用靠 Node 原生类型擦除直接执行源码；`vite` / `webpack` / `mcp` / `devtools` 的 `exports` 指向 `dist`，改完必须重新 build。真正发布时的入口统一由 `package.json` 的 `publishConfig.exports` 改写成 `dist/*.mjs`，别把 `exports` 自己改成 `dist`。
- **包管理**：pnpm，`packageManager` 钉 `pnpm@9.0.2`；`preinstall` 跑 `only-allow pnpm`，npm / yarn / bun 会被拒绝。工作区是 `packages/*` + `playground/*`，`playground/vue2-webpack` 被排除在外（npm 管理的 Vue 2 + webpack4 工具链）。
- **构建**：tsdown 逐包产出 ESM `.mjs` + `.d.ts`（`platform: node`）。例外是 `probes`：产出 CJS + ES2017 的 `dist/agent-vue2.js`，依赖全部内联（小程序环境没有 `node_modules`），`vue` 保持 external，不产 dts。
- **面板**：`packages/client` 是 Vite + Vue SPA（`base: './'`，UnoCSS），私有包不发布；构建产物由 `core` 的 `scripts/copy-panel.mjs` 拷进 `packages/core/dist/panel`，随 core 走向 npm。
- **测试**：vitest，配置在各包 `vitest.config.ts`，用例在 `packages/<pkg>/test`；根 `pnpm test` 走 turbo（`cache: false`）。
- **契约来源**：node 侧与小程序探针共用的协议类型、RPC 方法名、常量都在 `@uni-helper/devtools-shared`（`src/types.ts` 顶部有 RPC 全表）。改协议先改这里，再改两端。

## 命令

```bash
pnpm install # 装依赖，postinstall 装 simple-git-hooks
pnpm build # turbo 全量构建
pnpm --filter @uni-helper/devtools-vite build # 单包构建
pnpm dev # turbo stub：目前只有 client 定义 stub（面板 watch）
pnpm play # client watch + nodemon 重启 playground 的 mp-weixin 编译
pnpm --filter @uni-helper/devtools-client dev # 面板 SPA 独立开发，URL 加 ?mock 用 fixtures 假数据
pnpm test # 所有包跑 vitest
pnpm --filter @uni-helper/devtools-core test # 单包测试
pnpm --filter @uni-helper/devtools-client typecheck
node packages/core/scripts/e2e-node.mjs # node 侧验收：harness + 探针连接 + RPC 中继
node packages/core/scripts/dev.mjs # 起开发 harness（--hub hub 模式，--port 指定端口）
pnpm --filter vitesse-uni-app test:e2e # Playwright + wxa-runner 跑 mp-weixin 产物（先 build）
pnpm lint && pnpm lint:fix # oxlint（忽略 packages/core/assets 与 playground）
pnpm format && pnpm format:check # oxfmt
pnpm check:publish # npm pack 后核对入口是否齐全（先 build）
pnpm release # bumpp -r，维护者发版
```

构建顺序：`core` 的 build 末尾跑 `scripts/copy-panel.mjs`，需要 `packages/client/dist` 已经存在，干净 checkout 上先构建 client 再构建 core。

## 架构

| 包         | 角色                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared`   | 跨端契约：`constants.ts`（冻结常量，**必须零 import**）、`types.ts`（协议类型）、`utils/*`（纯函数工具，走子路径导出以免被探针整包引入）                                                                                                 |
| `core`     | node 侧：`devframe.ts`（DevframeDefinition + RPC handler + agent 元数据）、`relay.ts`（探针注册表）、`sidecar.ts`（服务启动）、`inspect-serve.ts`（Inspect 托管）、`storage.ts`（Storage 采集）、`project-root.ts`（uni 工程根目录推断） |
| `probes`   | 小程序运行时：`runtime/`（tree / state / pinia / vuex / network / storage / navigate / reactivity-graph 等采集）、`adapter/`（uni / wx API 差异）、`socket/`、`vue2/` 与 `vue3/` 两条线                                                  |
| `vite`     | Vite 插件：`index.ts`（钩子 + `isDev` 门禁 + 起 sidecar）、`entry-inject.ts`（入口注入纯函数）、`instrument.ts`（AST 插桩）                                                                                                              |
| `webpack`  | Webpack 插件：`index.ts`（`ensureCliContext` + chainWebpack 注入）、`stale-agent.ts`（陈旧探针产物告警）                                                                                                                                 |
| `adapter`  | 私有：把 devframe RPC 翻译成官方 client 协议（`mapping/`），另有 `mock-backend.ts` + `fixtures.ts` 支撑面板 `?mock`                                                                                                                      |
| `client`   | 私有：面板 SPA，`pages/`（components / pages / network / graph / inspect / timeline / settings 等）、`components/`、`composables/`                                                                                                       |
| `mcp`      | MCP 暴露面：`MCP_SETTING = 'auto'` 让 devframe 在 agent surface 非空时自动挂 `__mcp`，另有 stdio 服务与 fetch handler                                                                                                                    |
| `devtools` | 门面包：`index.ts` 只做聚合再导出，`cli.ts` 提供 `dev` / `build` / `mcp` / `connect` 子命令                                                                                                                                              |

### 关键机制

- **编译期与运行时分工**：`vite/src/entry-inject.ts` 只做纯函数策略（入口过滤、防重、虚拟入口、AST 门控），`instrument.ts` 用 MagicString 插桩，把 `__file` / `__name` 与 `script setup` 的绑定挂到 render 函数上（属性名 `BINDINGS_PROP`，探针读同一个常量）。这是小程序构建丢了源文件信息、`setupState` 为空时的补救路径。
- **UNI_CLI_CONTEXT 要尽早 realpath**：`webpack/src/index.ts` 的 `ensureCliContext()` 在插件加载时设好，否则会撞上 uni 自身的初始化时序 bug。
- **探针单活跃**：`AgentRegistry` 只把读写落到最后连上的探针，旧连接保持但被忽略（踢掉会引发两端抢占）；单次 RPC 默认超时 5s；探针抛的错经 JSON 出口被摊平成 `{ name, message }`，不要再当 Error 实例判断。
- **sidecar 独占端口**：面板挂在根路径 `/`，`__ws` 给探针，`__mcp` 给 MCP；host 由 `resolveAdvertisedHost()` 决定（`UNI_DEVTOOLS_HOST` → 本机局域网 IP）。鉴权默认关闭，开启后每次启动生成 token 并拼进面板地址。
- **MCP 直连只接受本机请求**（`isLocalMcpRequest`），用局域网 IP 访问会 401。
- **Inspect 静态托管**用 devframe 的 `mountStaticHandler`（h3 sub-app mount，自带段边界匹配和 base 剥离），不要自己 `app.use(path, handler)`——h3 v2 是精确匹配。
- **Storage 缓存边界**：只有 keys 列表与容量这类元数据走 2 秒 TTL 缓存，探针推送变更时作废；键值内容永不缓存。
- **RPC 方法名全表在 core 的 `rpc-names.ts` 组装**，不放进 shared：合并表会让小程序构建无法 tree-shake，把 Vue 3 专属代码带进 Vue 2 产物，「零 Vue 3 污染」的 `grep -ci pinia` 判据就废了。
- **CLI 的 stdout 是 MCP 传输通道**：`mcp` / `connect` 子命令下日志一律走 stderr。`connect` 动态 import `@devframes/agentic/connect`，跟随本包锁定的 devframe 版本。
- **推送入口不进 Agent 工具列表**：探针 → node 的推送 RPC 不带 agent 描述与参数 schema，所以不会出现在 MCP 工具里。

## 约定

- 注释和文档用中文。文件头写「为什么这么做」，以及踩过的坑（现有代码大量这么写，跟着来）。
- 文件名 kebab-case；包内相对 import 带 `.ts` 后缀。
- 新增依赖：小程序侧代码的依赖必须能被打进 `probes` 的 CJS 产物（记得补 `tsdown.config.ts` 的 `alwaysBundle`）。
- 测试放 `packages/<pkg>/test`，用包内 `vitest.config.ts` 跑；小程序端到端在 `playground/vue3-vite/e2e`，流程见 `.claude/skills/mp-weixin-e2e.md`。
- 提交信息用 Conventional Commits，分支按 `feat/`、`fix/`、`docs/`、`chore/` 命名；pre-commit 钩子只跑 `oxfmt`，lint 和测试要自己先跑。
- 行为或限制变了，同步更新 `docs/FEATURES.md`；跨端协议或 RPC 调整先读 `docs/ARCHITECTURE_PLAIN.md`。
