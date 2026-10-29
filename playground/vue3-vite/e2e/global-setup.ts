import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

// playground 是 CJS 工程（无 "type": "module"），Playwright 按 CJS 加载，没有 import.meta
const PLAYGROUND_DIR = path.resolve(__dirname, '..')
const READY_TIMEOUT = 180_000

/**
 * 拉起 `uni -p mp-weixin`：它产出 dist/dev/mp-weixin，并在同一进程里启动 sidecar。
 * 地址（开启鉴权时还有 token）从日志解析后放进环境变量，worker 进程继承。
 *
 * 已有构建在跑时设置 UNI_E2E_BASE_URL（开启鉴权时再加 UNI_E2E_TOKEN）跳过拉起
 * （值见构建日志）。
 */
export default async function globalSetup() {
  if (process.env.UNI_E2E_BASE_URL) return

  const child = spawn('pnpm', ['dev:mp-weixin'], {
    cwd: PLAYGROUND_DIR,
    // 探针按这个地址连 sidecar：固定 IPv4 回环，不依赖局域网 IP，
    // 也避开 localhost 解析到 ::1 时撞上别的进程
    env: { ...process.env, UNI_DEVTOOLS_HOST: '127.0.0.1' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const stop = () => {
    try {
      process.kill(-child.pid!, 'SIGTERM')
    } catch {
      // 进程组已退出
    }
  }

  let log = ''
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop()
      reject(new Error(`等待构建与 sidecar 就绪超时：\n${log}`))
    }, READY_TIMEOUT)
    const onData = (chunk: Buffer) => {
      log += chunk.toString()
      const panel =
        /Uni DevTools 面板[^\n]*\n\s*(http:\/\/[^\s?]+\/)(?:\?devframe_auth_token=([0-9a-f]+))?/.exec(
          log,
        )
      if (panel && /Build complete/.test(log)) {
        clearTimeout(timer)
        process.env.UNI_E2E_BASE_URL = panel[1]
        if (panel[2]) process.env.UNI_E2E_TOKEN = panel[2]
        resolve()
      }
    }
    child.stdout!.on('data', onData)
    child.stderr!.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`构建进程提前退出（code=${code}）：\n${log}`))
    })
  })

  return stop
}
