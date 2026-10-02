import { parse } from 'node:path'
import { globSync } from 'fast-glob'

export function extractPathByStack(filePath: string) {
  const url = new URL(filePath)
  const pathname = url.pathname
  const relevantPath = pathname.split('/appservice')[1]
  const parsePath = parse(relevantPath)
  const pathWithoutExtension = `${parsePath.dir}/${parsePath.name}`
  return pathWithoutExtension
}

export function sourceFile(filePath: string) {
  if (filePath.includes('common/vendor')) {
    return 'node_modules'
  }
  if (filePath === '//app') {
    filePath = '/main'
  }
  const files = globSync(`**${filePath}.*`, {
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
    ],
  })
  if (files.length > 0) {
    return files[0]
  }
  return ''
}
