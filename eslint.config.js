import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: false,
    formatters: true,
    ignores: [
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
