import process from 'node:process'
import { isH5 } from '@uni-helper/uni-env'
import minimist from 'minimist'
import type { Options } from '../types'
import { loadVueDevtoolsPlugin } from './../loadOtherPlugin/vueDevtools'

export function pluginByEnv(options?: Partial<Options>) {
  if (isH5)
    return [loadVueDevtoolsPlugin(options?.vueDevtoolsOptions || {})]
  const args = minimist(process.argv.slice(2))
  const isBuild = args._.includes('build')
  if (isBuild)
    return []
}
