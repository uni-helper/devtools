import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: false,
    formatters: true,
    ignores: [
    // uni-devtools 移植包（官方源码 + vendored kit）不参与本仓 lint
      'packages/panel/**',
      'packages/devtools-kit/**',
      // devframe 内的 vendored 兜底面板产物（dist 形态，非手写源码）
      'packages/devframe/assets/**',
      // devframe POC 留底（结论已抽到 FINDINGS.md）
      'spike/**',
      '**/node_modules/**',
      'playground/**',
    ],
  },
  {
    rules: {
      'no-console': 'warn',
    },
    languageOptions: {
      globals: {
        uni: 'readonly',
        __UNI_DEVTOOLS_PORT__: 'readonly',
      },
    },
  },
  {
    // 探针运行在小程序沙箱，window/document/location 会炸 mp 构建（原先散落在各模块头注释里）
    files: ['packages/devframe/src/agent/**', 'packages/devframe/src/shared/**'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'location'],
    },
  },
)
