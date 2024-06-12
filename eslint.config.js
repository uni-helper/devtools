import antfu from '@antfu/eslint-config'

export default antfu(
  {
    unocss: false,
    formatters: true,
  },
  {
    ignores: ['**/uniJs.js', 'playground/**'],
    rules: {
      'no-console': 'warn',
    },
  },
)
