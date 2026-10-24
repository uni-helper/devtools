import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

/**
 * 开发期陈旧产物检测：resolveAgentVue2 优先消费 gitignored 的 dist/agent-vue2.js
 * 预构建产物，探针源码更新后若未重新 build，webpack 会静默打包旧 bundle——
 * 「改了源码但行为没变」的经典排查陷阱。这里比对 dist 与 probes src 的最新
 * mtime，过期则在控制台高亮告警（生产构建零开销，检查失败静默跳过）。
 */
export function warnIfStaleAgentDist(distPath: string): void {
  if (process.env.NODE_ENV === 'production') return
  // 只针对 monorepo 开发：npm 装的探针包同时带 src 与 dist，解包后的 mtime 不可信，
  // 用户也无从重新构建（monorepo 里 workspace 软链解析后是真实路径，不含 node_modules）
  if (distPath.split(path.sep).includes('node_modules')) return
  try {
    const distDir = path.dirname(distPath)
    if (path.basename(distDir) !== 'dist') return // 源码直发（兜底路径）无陈旧问题
    const pkgDir = path.dirname(distDir)
    const srcDir = path.join(pkgDir, 'src')
    if (!fs.existsSync(srcDir)) return

    const distMtime = fs.statSync(distPath).mtimeMs
    const entries = fs.readdirSync(srcDir, { recursive: true }) as string[]
    let newestSrcMtime = 0
    for (const entry of entries) {
      const rel = String(entry)
      if (!/\.(ts|mts|js|mjs)$/.test(rel)) continue
      const mtime = fs.statSync(path.join(srcDir, rel)).mtimeMs
      if (mtime > newestSrcMtime) newestSrcMtime = mtime
    }

    if (newestSrcMtime > distMtime) {
      console.warn(
        `[uni-devtools] Stale agent bundle detected: ${distPath} is older than packages/probes/src. ` +
          `Run "pnpm --filter @uni-helper/devtools-probes build" and rebuild, ` +
          `or the probe behavior may not match the source.`,
      )
    }
  } catch {
    // 检测自身的任何异常都不影响构建
  }
}
