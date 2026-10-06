import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: false,
    formatters: true,
    ignores: [
    // uni-devtools 移植包（官方源码）不参与本仓 lint
      'packages/client/**',
      // 协议适配器：与移植包同批从 panel 拆出，同样暂不纳入 lint
      // （启用会一次性引入存量告警，属独立决定，见批次 B-20261006-pkg-split 记录）
      'packages/adapter/**',
      // core 内的 vendored 兜底面板产物（dist 形态，非手写源码）
      'packages/core/assets/**',
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
    files: ['packages/probes/src/**', 'packages/shared/src/**'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'location'],
    },
  },
)
