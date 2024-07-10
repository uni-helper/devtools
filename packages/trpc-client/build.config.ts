import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/index.ts',
    'src/links/httpLink.ts',
    'src/links/httpBatchLink.ts',
    'src/links/splitLink.ts',
    'src/links/loggerLink.ts',
    'src/links/wsLink.ts',
    'src/shared/index.ts',
  ],
  clean: true,
  declaration: true,
  rollup: {
    emitCJS: true,
    inlineDependencies: true,
  },
})
