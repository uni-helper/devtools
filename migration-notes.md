# ESLint to Oxlint/Oxfmt Migration Notes

## 迁移时间

2026-10-08

## 成功迁移的配置

### 忽略路径 (Ignores)

**重要变更：** 相比 ESLint 配置，我们**移除了 `packages/client/**` 和 `packages/adapter/**` 的忽略**，让这些包也参与代码检查：

最终 oxlintrc.json 的 ignores 配置：

- `packages/core/assets/**` - vendored 兜底面板产物（构建产物，不应检查）
- `**/node_modules/**` - 依赖目录
- `playground/**` - 示例项目

**移除忽略的原因：**

- `packages/client/**` 和 `packages/adapter/**` 虽然在 ESLint 时代因存量问题被忽略，但它们是我们维护的核心代码
- Oxlint 检查结果显示问题很少（client: 2个问题，adapter: 2个问题），完全可控
- 将这些包纳入 lint 有助于保持代码质量

**当前 lint 结果统计：**

- 总计：13 个警告，0 个错误
- packages/adapter: 2 个问题
- packages/client: 2 个问题
- packages/core: 6 个问题
- packages/probes: 1 个问题
- playground: 2 个问题（已忽略，不影响 CI）

### 规则 (Rules)

- `no-console: "warn"` - ✅ 已迁移（Oxlint 原生支持）

## 无法迁移的配置

### 1. 全局变量声明

**原配置：**

```javascript
languageOptions: {
  globals: {
    uni: 'readonly',
    __UNI_DEVTOOLS_PORT__: 'readonly',
  },
}
```

**状态：** ⚠️ 无法直接迁移

**原因：** Oxlint 不支持自定义全局变量声明。这些变量如果未定义使用会触发 `no-undef` 警告。

**建议方案：**

- 在使用这些全局变量的文件中添加 TypeScript 声明文件（如 `global.d.ts`）
- 或在文件顶部使用 `// @ts-expect-error` 注释
- Oxlint 主要依赖 TypeScript 类型系统进行检查

### 2. 特定文件规则 (File-specific Rules)

**原配置：**

```javascript
{
  files: ['packages/probes/src/**', 'packages/shared/src/**'],
  rules: {
    'no-restricted-globals': ['error', 'window', 'document', 'location'],
  },
}
```

**状态：** ⚠️ 无法直接迁移

**原因：** Oxlint 目前不支持基于文件路径的规则覆盖（overrides）。

**建议方案：**

- 依赖代码审查和测试确保这些文件不使用受限全局变量
- 在相关文件顶部添加注释说明限制
- 等待 Oxlint 未来版本支持 overrides 功能

### 3. 格式化配置

**原配置：**

```javascript
{
  formatters: true,  // @antfu/eslint-config 启用格式化
}
```

**状态：** ✅ 已替代

**说明：** 使用 Oxfmt 替代 ESLint 的格式化功能。Oxfmt 是独立的格式化工具，不在 lint 配置中设置。

## Oxlint vs ESLint 主要差异

### 1. 性能

- **Oxlint**: 使用 Rust 编写，速度快 50-100 倍
- **ESLint**: JavaScript 编写，较慢但生态成熟

### 2. 规则覆盖

- **Oxlint**: 支持核心 ESLint 规则，但插件生态较少
- **ESLint**: 规则和插件生态成熟

### 3. 配置灵活性

- **Oxlint**: 配置更简单但功能有限（如无 overrides）
- **ESLint**: 配置灵活强大

### 4. 格式化

- **Oxfmt**: 独立工具，类似 Prettier
- **ESLint**: 可集成格式化规则或使用 eslint-plugin-format

## 迁移后的工作流

### Lint

```bash
pnpm lint          # 运行 oxlint 检查
```

### Format

```bash
pnpm lint:fix      # 运行 oxfmt 格式化
```

### Git Hooks

lint-staged 配置已更新为使用 `oxfmt`，在提交前自动格式化代码。

## 注意事项

1. **首次运行可能发现新问题**: Oxlint 的规则实现可能与 ESLint 略有不同，可能会发现之前未检测到的问题。

2. **全局变量警告**: 如果看到 `uni` 或 `__UNI_DEVTOOLS_PORT__` 的 no-undef 警告，需要添加类型声明。

3. **受限全局变量**: `packages/probes/src/**` 和 `packages/shared/src/**` 中的 `window`/`document`/`location` 使用需要手动检查。

4. **CI/CD 更新**: 确保 CI 环境也更新了相关命令。

## 回滚方案

如果需要回滚到 ESLint：

```bash
# 恢复 package.json 依赖
git checkout HEAD -- package.json

# 恢复 eslint.config.js
git checkout HEAD -- eslint.config.js

# 删除 Oxlint 配置
rm oxlintrc.json

# 重新安装
pnpm install
```

## 参考资源

- [Oxlint 官方文档](https://oxc.rs/docs/guide/usage/linter.html)
- [Oxfmt 官方文档](https://oxc.rs/docs/guide/usage/formatter.html)
- [支持的 ESLint 规则列表](https://oxc.rs/docs/guide/usage/linter/rules.html)

---

# tsup SDK + esbuild CLI to tsdown Migration Notes

## 迁移时间

2026-10-24

## 迁移内容

每个需要打包的包一份 `tsdown.config.ts`（共 7 份：shared / core / probes / mcp / vite / webpack / devtools），build 脚本统一为 `tsdown`。被替换的旧链路：

- `scripts/build-dts.mjs`：tsup **SDK 编程式构建**（shared / core 的 JS+DTS，其余包的 DTS-only），已删除
- devtools / mcp / vite / webpack / probes 的 esbuild CLI 打包命令（含 banner 垫片、`rm -rf`+`cp -R` 拷 client）
- 根目录与各包的 `tsup` / `esbuild` devDependencies

特殊安排：core 的 `copy-panel.mjs` 挪到 tsdown **之后**执行——tsdown 的 `clean` 会清空 dist，旧顺序（先拷后建）会把面板清掉。

## 与旧产物有意为之的差异

1. **依赖外部化**：旧 esbuild 命令把 dependencies 全部打进 dist（仅 devframe 等显式 `--external`）；tsdown 默认外部化 dependencies / peerDependencies / optionalDependencies。被外部化的包都在各自 dependencies 里声明，npm 安装后可解析，同时消除了 devtools 与 mcp 各自打包一份 core 的模块状态重复。例外见 3。
2. **dts 扩展名**：`outExtensions` 必须显式给 `dts: '.d.ts'`——`type: "module"` 下 ESM 产物配 `.mjs` 时声明文件默认配对 `.d.mts`，而 publishConfig 全部指向 `.d.ts`。
3. **probes 必须自包含**：小程序环境没有 node_modules，其运行时依赖（shared / devframe / birpc）用 `alwaysBundle` 打进 `agent-vue2.js`；`alwaysBundle` 的匹配不覆盖子路径导入（`@uni-helper/devtools-shared/utils/tagged-value` 曾漏出），要用正则 `/^@uni-helper\//` 这类模式。同理 vite 包里 probes 发布物仍是 src 源码导出，也必须 `alwaysBundle`。
4. **banner 垫片 → `shims: true`**；cli 的 shebang 用 rolldown `outputOptions.banner`（函数形式只给 entry chunk 加）。
5. **vite 的 inspect client 拷贝**改用 tsdown `copy` 选项。
6. **core/src/sidecar.ts 补了返回类型标注**（`CreateDevServerOptions`）：推断返回类型经 `createInspectApp` 牵出 h3 的深层类型路径，rolldown-plugin-dts 发射报 TS2742（tsup 的 dts 管线不做此检查所以未暴露）。
7. **「零 Vue 3 污染」判据改用键名**：`grep -c 'pinia-state' dist/agent-vue2.js` 应为 0。rolldown 产物保留注释，旧判据 `grep -ci pinia` 会被注释字样假阳性（实测注释 5 处、真实键名 0 处）。

## 验证

- `pnpm build`：8/8 任务通过
- `pnpm test`：425 个测试全部通过（含 probes 针对打包产物的 224 个）
- `pnpm check:publish`：通过（入口齐全、面板随 core 发布、所有 `.mjs` 入口 node 实际加载成功）
- `node packages/devtools/dist/cli.mjs --help`：CLI 冒烟通过

## 回滚方案

```bash
git checkout <迁移前 commit> -- package.json packages/*/package.json scripts/build-dts.mjs packages/core/src/sidecar.ts
rm packages/*/tsdown.config.ts
pnpm install
```
