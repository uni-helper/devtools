import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: false,
    formatters: true,
    ignores: [
    // uni-devtools 移植包（官方源码 + vendored kit + legacy 留底）不参与本仓 lint
      'packages/panel/**',
      'packages/panel-legacy/**',
      'packages/devtools-kit/**',
      '**/node_modules/**',
      '**/uniJs.js',
      'playground/**',
      '**/plugin/client/**',
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
)
