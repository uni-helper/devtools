import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index',
  ],
  outDir: './../plugin/cli',
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
})
