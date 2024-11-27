import { defineBuildConfig } from 'unbuild'

const buildPkgs = ['open', 'mime']
export default defineBuildConfig({
  entries: [
    'src/index',
    'cli/index',
  ],
  clean: true,
  declaration: true,
  externals: [
    'vite',
    'vite-plugin-inspect',
    'vite-plugin-vue-devtools',
  ],
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
  hooks: {
    'build:before': function (ctx) {
      ctx.options.externals = ctx.options.externals.filter(
        v => !buildPkgs.includes(v as string),
      )
    },
  },
})
