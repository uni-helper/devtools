import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // 仅构建期可解析的虚拟模块，单测指向空配置替身（见 test/stubs/）
      'virtual:uni-devtools-agent': fileURLToPath(
        new URL('./test/stubs/virtual-uni-devtools-agent.ts', import.meta.url),
      ),
    },
  },
  test: {
    // devframe 包级测试配置，root 自动限定在当前目录
  },
})
