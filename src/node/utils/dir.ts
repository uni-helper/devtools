import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

export const DIR_DIST = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url))

export const DIR_CLIENT = resolve(DIR_DIST, '../../../dist/client')

export const DIR_TMP = join(tmpdir(), '.uni-devtools')

export const DIR_INSPECT_LIST = join(DIR_TMP, 'reports', 'list.json')
