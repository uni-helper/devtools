import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: [
    'src/index.ts',
    'src/links/httpLink.ts',
    'src/links/httpBatchLink.ts',
    'src/links/splitLink.ts',
    'src/links/loggerLink.ts',
    'src/links/wsLink.ts',
    'src/shared/index.ts',
  ],
  clean: true,
  format: ['esm', 'cjs'],
  dts: true,
})
