#!/usr/bin/env node
import process from 'node:process'
import { startHarness } from '../src/harness.ts'

const mode = process.argv.includes('--hub') ? 'hub' : 'standalone'
const portArgIndex = process.argv.indexOf('--port')
const port =
  portArgIndex !== -1
    ? Number(process.argv[portArgIndex + 1])
    : mode === 'hub'
      ? 58018
      : 9999

console.log(`[uni-devtools] 启动开发 harness (模式: ${mode}, 端口: ${port})...`)

const harness = await startHarness({
  mode,
  port,
})

console.log('\n======================================================')
console.log(`  Uni DevTools Harness 已启动 [模式: ${harness.mode}]`)
console.log(`  Origin:            ${harness.origin}`)
console.log(`  面板访问 URL:      ${harness.panelUrl}`)
console.log(`  探针 WebSocket:    ${harness.wsUrl}`)
console.log(`  元数据 JSON:       ${harness.connectionJsonUrl}`)
console.log('======================================================\n')

async function onExit() {
  console.log('\n正在停止 harness...')
  await harness.close()
  process.exit(0)
}

process.on('SIGINT', onExit)
process.on('SIGTERM', onExit)
