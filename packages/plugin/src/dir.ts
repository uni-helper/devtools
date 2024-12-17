import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

export const DIR_DIST = typeof __dirname !== 'undefined'
  ? __dirname
  : dirname(fileURLToPath(import.meta.url))

export const DIR_ROOT = resolve(DIR_DIST, '../../')

export const DIR_CLIENT = resolve(DIR_DIST, '../client')

export const DIR_TMP = join(tmpdir(), '.uni-devtools')

export const DIR_TMP_INSPECT = join(DIR_TMP, '.inspect')

export const DIR_TMP_VISUALIZER = join(DIR_TMP, '.visualizer')

export const DIR_TMP_VISUALIZER_NAME = join(DIR_TMP_VISUALIZER, 'index.html')

export const DIR_INSPECT_LIST = join(DIR_TMP_INSPECT, 'reports', 'list.json')
