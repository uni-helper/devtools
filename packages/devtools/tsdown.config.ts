import { defineConfig } from 'tsdown'

// index 与 cli 拆成两段配置：只有 cli 需要 shebang，且 cli 不产 dts。
// clean 只在第一段开启，避免第二段把 index 的产物清掉
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
    dts: true,
    shims: true,
    clean: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
    shims: true,
    clean: false,
    dts: false,
    outputOptions: {
      banner: (chunk) => (chunk.isEntry ? '#!/usr/bin/env node' : ''),
    },
  },
])
