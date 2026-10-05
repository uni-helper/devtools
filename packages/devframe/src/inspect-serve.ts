/**
 * Vite Inspect 静态托管（node 侧）。
 *
 * vite-plugin-inspect 以 `build: true` 运行时，每个 watch rebuild（buildEnd）
 * 会把自带 client UI + reports 全量写入 outputDir——该目录即一个自包含的
 * 转换管线检查器网站。官方 Vue DevTools v7 的 Inspect tab 就是 iframe 内嵌
 * 这套 UI；我们把它托管在 sidecar 的 `${INSPECT_MOUNT_PATH}/` 下供面板 iframe。
 *
 * 静态服务用 devframe 官方 `mountStaticHandler`（h3 sub-app mount，段边界
 * 匹配 + base 剥离内建——不要自己 `app.use(path, h)`，h3 v2 是精确匹配）。
 * h3 仅为此处构造 app 实例（devDependencies）。
 */
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { H3 } from 'h3'
import { mountStaticHandler } from 'devframe/utils/serve-static'

/** 面板 iframe 与 sidecar 静态路由的挂载前缀（plugin.ts 的 BASE 之下） */
export const INSPECT_MOUNT_PATH = '/__uni-devtools/inspect'

/** vite-plugin-inspect 的落盘目录（沿用旧插件 DIR_TMP_INSPECT 约定） */
export const INSPECT_OUTPUT_DIR = join(tmpdir(), '.uni-devtools', '.inspect')

/**
 * inspect 报告是否已产出（首次 buildEnd 之前为 false，面板据此隐藏 tab）。
 */
export function isInspectAvailable(): boolean {
  return existsSync(join(INSPECT_OUTPUT_DIR, 'index.html'))
}

/**
 * 预配置的 sidecar h3 app：挂载 inspect 静态托管（plugin.ts 的 start 与
 * harness.ts 两模式共用，保持冒烟路径与真实 sidecar 一致）。
 */
export function createInspectApp(): H3 {
  const app = new H3()
  // single: false —— miss 不回退 index.html（inspect UI 自带 trailing-slash
  // 跳转脚本，缺失资源按 404 如实返回）
  mountStaticHandler(app, INSPECT_MOUNT_PATH, INSPECT_OUTPUT_DIR, {
    indexNames: ['index.html'],
    single: false,
  })
  return app
}
