import Inspect from 'vite-plugin-inspect'
import fs from 'fs-extra'
import { DIR_TMP_INSPECT } from '../dir'

/** 加载vite-plugin-inspect插件 */
export function loadInspectPlugin() {
  fs.mkdirSync(DIR_TMP_INSPECT, { recursive: true })
  const inspect = Inspect({
    build: true,
    outputDir: DIR_TMP_INSPECT,
  })

  return inspect
}
