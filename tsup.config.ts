import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: [
    'src/index.ts',
  ],
  clean: true,
  target: 'es5',
  format: ['cjs', 'esm'],
  dts: true,
  onSuccess: 'npm run build:fix',
})
