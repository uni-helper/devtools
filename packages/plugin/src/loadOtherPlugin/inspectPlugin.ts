import Inspect from 'vite-plugin-inspect'
import { mkdirSync } from 'fs-extra'
import { DIR_TMP_INSPECT } from '../dir'

export function loadInspectPlugin() {
  mkdirSync(DIR_TMP_INSPECT, { recursive: true })
  const inspect = Inspect({
    build: true,
    outputDir: DIR_TMP_INSPECT,
  })

  return inspect
}
