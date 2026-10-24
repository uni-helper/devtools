import { existsSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'

/**
 * 当前 uni-app 工程的根目录（含 package.json 的那一层）。
 *
 * 优先级：`UNI_CLI_CONTEXT`（vue-cli 线）→ `UNI_INPUT_DIR` 的上一层（有
 * package.json 或输入目录就是 `src`）→ `UNI_INPUT_DIR` 本身（HBuilderX 工程）→ cwd。
 */
export function getProjectRoot(): string {
  if (process.env.UNI_CLI_CONTEXT) {
    return resolve(process.env.UNI_CLI_CONTEXT)
  }
  if (process.env.UNI_INPUT_DIR) {
    const inputDir = resolve(process.env.UNI_INPUT_DIR)
    const parent = resolve(inputDir, '..')
    if (
      existsSync(resolve(parent, 'package.json')) ||
      resolve(parent, 'src') === inputDir
    ) {
      return parent
    }
    return inputDir
  }
  return process.cwd()
}

export function isInsideProjectRoot(
  targetPath: string,
  root = getProjectRoot(),
): boolean {
  const rel = relative(root, targetPath)
  return !rel.startsWith('..') && !isAbsolute(rel)
}
