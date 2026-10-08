# ESLint to Oxlint/Oxfmt Migration Notes

## 迁移时间

2026-10-08

## 成功迁移的配置

### 忽略路径 (Ignores)

所有 ESLint 的 ignores 配置已成功迁移到 oxlintrc.json：

- `packages/client/**` - uni-devtools 移植包
- `packages/adapter/**` - 协议适配器
- `packages/core/assets/**` - vendored 兜底面板产物
- `**/node_modules/**` - 依赖目录
- `playground/**` - 示例项目

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
