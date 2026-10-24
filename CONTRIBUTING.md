# 贡献指南 (Contributing Guide)

感谢你对 **Uni DevTools** 的关注与支持！Uni DevTools 欢迎任何形式的贡献，包括但不限于提交 Bug 反馈、特性建议、文档优化以及 Pull Request 代码贡献。

在开始贡献前，请先阅读本指南以了解本项目的目录设计与本地开发流程。

---

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

docs/                 # 架构设计与历史方案演进文档
├── ARCHITECTURE_PLAIN.md  # 架构与核心设计（白话版）
├── FINAL_STRUCTURE.md     # 最终目录架构规范
└── HANDOFF.md             # 交接规范与协议详情
```

---

## 本地开发

### 1. 环境准备

- **Node.js** >= 18.0.0
- **pnpm** >= 9.0.0

```bash
# 克隆代码仓库
git clone https://github.com/uni-helper/devtools.git
cd devtools

# 安装依赖
pnpm install
```

### 2. 构建与调试

```bash
# 全量构建所有包
pnpm build

# 构建指定包（修改对应源码后）
pnpm --filter @uni-helper/devtools-vite build
pnpm --filter @uni-helper/devtools-client build

# 启动小程序示例测试（Playground 监控模式）
pnpm play
# 或进入 playground/vue3-vite 独立运行：
# cd playground/vue3-vite && pnpm dev:mp-weixin

# 独立启动前端面板开发服务器（支持 Mock 模式，访问 http://localhost:5173/?mock 无需后端）
pnpm --filter @uni-helper/devtools-client dev
```

### 3. 测试与代码质量检查

在提交代码前，请确保所有测试和代码规范检查均通过：

```bash
# 运行单元测试
pnpm test
# 或针对单包运行测试：
# npx vitest run packages/core/test/
# npx vitest run packages/adapter/test/

# 前端面板类型检查
pnpm --filter @uni-helper/devtools-client typecheck

# 运行 Node 侧端到端验收脚本
node packages/core/scripts/e2e-node.mjs

# 代码规范与格式化检查
pnpm lint
pnpm lint:fix
pnpm format:check
```

---

## 提交与 PR 准则

1. **分支管理**：基于最新 `main` 或主开发分支创建特性分支，不要在被修改的脏工作区直接提交无关修改。
2. **单一职责**：保持每个 PR 聚焦于单一 Bug 修复或单一功能，以便审查与回溯。
3. **测试覆盖**：新增功能或修复 Bug 时，请同步补充相应的单测用例。若调整了文档断言类测试，请在 PR 说明中阐明修改原因。
4. **架构遵循**：涉及跨端协议或 RPC 调整时，请先阅读 [架构与核心设计（白话版）](docs/ARCHITECTURE_PLAIN.md) 与 [交接文档](docs/HANDOFF.md)。
