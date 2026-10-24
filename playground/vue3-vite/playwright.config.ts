import process from 'node:process'
import { defineConfig } from '@playwright/test'
import type { WxaOptions } from '@open-wxa/wxa-runner-playwright'

// mp-weixin 端到端：wxa-runner 在 Chrome 里跑编译产物，探针经真实 WebSocket 连
// globalSetup 拉起的 sidecar，用例再以面板同款 devframe RPC 核对数据。
// 不需要微信开发者工具，Linux CI 可跑
export default defineConfig<WxaOptions>({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  // relay 只认最新连上的探针，用例并行会互相抢占
  workers: 1,
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    channel: 'chrome',
    wxaProject: 'dist/dev/mp-weixin',
    trace: 'retain-on-failure',
  },
})
