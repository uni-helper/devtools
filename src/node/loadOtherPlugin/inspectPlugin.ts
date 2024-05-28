import Inspect from 'vite-plugin-inspect'
import { DIR_TMP } from '../utils/dir'

export function loadInspectPlugin() {
  const inspect = Inspect({
    build: true,
    outputDir: DIR_TMP,
  })

  return inspect
}
