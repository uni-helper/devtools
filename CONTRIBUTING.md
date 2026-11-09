# 贡献指南 (Contributing Guide)

感谢你对 **Uni DevTools** 的关注与支持！Uni DevTools 欢迎任何形式的贡献，包括但不限于提交 Bug 反馈、特性建议、文档优化以及 Pull Request 代码贡献。

本指南覆盖仓库结构、本地开发流程、测试方式与提交规范。

---

## 前置条件

- **Node.js** 24 —— 以 [.node-version](.node-version) 为准，CI 也用这份文件设置版本
- **pnpm** 9.0.2 —— 以 `package.json` 的 `packageManager` 为准
- 包管理工具只接受 pnpm：`preinstall` 跑 `only-allow pnpm`，用 npm / yarn / bun 安装会被拒绝

## 仓库结构

本项目采用 pnpm workspace monorepo 进行管理，各包职责清晰解耦：

```text
packages/
├── devtools/        # 门面包（@uni-helper/devtools）：聚合入口并提供 uni-devtools CLI
├── vite/            # Vite 插件（@uni-helper/devtools-vite）：编译期 AST 插桩与 Devframe 伴生服务
├── webpack/         # Webpack 插件（@uni-helper/devtools-webpack）：针对 Vue 2 + Webpack 4 方案
├── core/            # Node 核心（@uni-helper/devtools-core）：Devframe 定义、WebSocket 中继、Inspect 托管
├── probes/          # 小程序探针（@uni-helper/devtools-probes）：Vue 2/3 双线运行时采集与沙箱隔离
├── adapter/         # 协议适配器（@uni-helper/devtools-adapter）：将 Devframe RPC 翻译为官方 Client 协议
├── client/          # UI 面板（@uni-helper/devtools-client）：移植自官方 Vue DevTools v9 的 SPA 面板
├── mcp/             # MCP 暴露面（@uni-helper/devtools-mcp）：为 AI Coding Agent 提供 stdio / fetch 端点
└── shared/          # 跨端共享（@uni-helper/devtools-shared）：协议类型、契约常量与纯函数工具

playground/
├── vue3-vite/        # uni-app Vue 3 + Vite 示例项目（集成全场景测试用例）
└── vue2-webpack/     # uni-app Vue 2 + Webpack 4 独立示例（npm 管理）

scripts/              # 发布前自检脚本（check-publish.mjs）

docs/                 # 架构设计与方案文档
├── ARCHITECTURE_PLAIN.md              # 架构与核心设计（白话版）
├── FEATURES.md                        # 各面板的实现原理与限制
├── FINAL_STRUCTURE.md                 # 最终目录架构规范
├── HUB_UI_SPECIFICATION.md            # devframe hub 模式的面板规范
├── HOW_IT_GETS_ORIGINAL_VARIABLE_NAMES.md
├── DEVFRAME_MIGRATION_PLAN.md         # 迁移方案（历史）
├── MOCK_BACKEND_REFACTOR_PLAN.md      # 面板 mock 后端（历史）
└── archive/                           # 已归档的早期文档
```

`adapter` 与 `client` 是私有包，不发布 npm；面板构建产物由 `core` 的构建脚本拷进 `packages/core/dist/panel`，跟随 `core` 一起发布。

## 本地开发

### 安装依赖

```bash
# 克隆代码仓库
git clone https://github.com/uni-helper/devtools.git
cd devtools

# 安装依赖（postinstall 会装 simple-git-hooks，提交前自动跑 lint-staged）
pnpm install
```

### 构建

```bash
pnpm dev                                        # turbo stub：目前只有 client 定义了 stub，即面板 SPA 的 watch 构建
pnpm build                                      # 全量构建（turbo 按包依赖顺序执行）
pnpm --filter @uni-helper/devtools-vite build   # 只构建单个包
```

构建顺序有一个约束：`@uni-helper/devtools-core` 的 `build` 末尾会跑 `scripts/copy-panel.mjs`，把 `packages/client/dist` 拷进 `packages/core/dist/panel`。单独构建 `core` 之前，`client` 必须已经构建过，否则脚本直接报错退出。

### 调试小程序与面板

```bash
# 面板 watch 构建 + nodemon 监听 packages/*/src，改动后重跑 playground 的 mp-weixin 编译
pnpm play

# 面板 SPA 独立开发，访问 http://localhost:5173/?mock 用 fixtures 假数据，不需要后端
pnpm --filter @uni-helper/devtools-client dev

# 进入 playground 单独编译
cd playground/vue3-vite && pnpm dev:mp-weixin
```

`playground` 通过包的 `exports` 读 `dist`，所以改完 `vite` / `webpack` / `core` / `probes` 的源码要重新 `pnpm build`（或构建对应包）才生效；只有 `client` 的改动由 `pnpm play` 里的 watch 构建自动接管。

## 测试与检查

```bash
pnpm test                                             # 所有包跑 vitest（turbo test）
pnpm --filter @uni-helper/devtools-core test          # 单个包
pnpm --filter @uni-helper/devtools-client typecheck   # 面板类型检查
node packages/core/scripts/e2e-node.mjs               # Node 侧验收：harness、__connection.json、探针连接与 RPC 中继
node packages/core/scripts/dev.mjs                    # 启动开发 harness（--hub 走 devframe hub 模式，--port 指定端口）
pnpm --filter vitesse-uni-app test:e2e                # Playwright e2e（需先 pnpm build）
pnpm lint && pnpm format:check                        # 代码规范与格式
pnpm lint:fix && pnpm format                          # 自动修复
pnpm check:publish                                    # 发布前自检：核对 npm pack 出的文件里入口是否齐全（需先 pnpm build）
```

### 测试说明

- 各包的 vitest 用例在 `packages/<pkg>/test`，配置是包内的 `vitest.config.ts`，所以用 `pnpm --filter <pkg> test` 跑，别在仓库根直接点路径。
- `e2e-node.mjs` 会真实拉起一个 harness（自动选隔离端口）并连探针跑 RPC 中继，本机需要能监听端口。
- playground 的 Playwright e2e 用 `@open-wxa/wxa-runner` 在 Chrome 里跑 `dist/dev/mp-weixin` 编译产物，不需要微信开发者工具，Linux CI 也能跑。

## 提交规范

- **分支**：从最新 `main` 切出，按改动类型命名，例如 `feat/xxx`、`fix/xxx`、`docs/xxx`、`chore/xxx`。`main` 之外的 `devframe` 是集成分支，跟 devframe 相关的改动在它上面联调。
- **提交信息**：遵循 Conventional Commits（`feat:`、`fix:`、`docs:`、`ci:`、`chore:`、`build:`），与现有 `git log` 保持一致。
- **提交前**：`pnpm lint && pnpm test` 全绿。pre-commit hook 会用 `oxfmt` 格式化暂存文件。
- 不要在脏工作区里夹带无关改动。

## Pull Request 指南

1. **单一职责**：一个 PR 只做一件事，便于审查与回溯。
2. **测试覆盖**：新增功能或修复 Bug 时同步补单测；若改动了文档断言类测试，在 PR 说明里写清原因。
3. **架构遵循**：涉及跨端协议或 RPC 调整时，先读 [架构与核心设计（白话版）](docs/ARCHITECTURE_PLAIN.md)，并同步更新 [功能细节](docs/FEATURES.md) 与相关类型。
4. **CI 要绿**：[e2e.yml](.github/workflows/e2e.yml) 在推送到 `main`、`devframe` 以及所有 PR 上跑 `pnpm install --frozen-lockfile` → `pnpm build` → Playwright e2e。

## 发布

维护者发布流程：

```bash
pnpm release     # bumpp -r：交互式升版本、打 tag 并推送
```

推送 `v*` tag 后 [release.yml](.github/workflows/release.yml) 触发：先 `pnpm build`，再逐包发布到 npm。tag 里带 `-` 的预发布版本走 `beta` 通道，不占用 `latest`。发布前建议先跑一遍 `pnpm check:publish`。

## 行为准则

参与本项目即表示同意遵守 [uni-helper 行为准则](https://github.com/uni-helper/.github/blob/main/CODE_OF_CONDUCT.md)。

有疑问或想法，欢迎到 [Issues](https://github.com/uni-helper/devtools/issues) 讨论。
