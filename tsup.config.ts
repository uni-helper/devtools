import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: [
    'src/node/index.ts',
  ],
  clean: false,
  target: 'es5',
  format: ['cjs', 'esm'],
  // dts: true,
  onSuccess: 'npm run build:fix',
})
