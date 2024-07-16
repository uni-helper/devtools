import { parse } from 'node:path'
import { globSync } from 'fast-glob'

export function extractPathByStack(filePath: string) {
  // 解析URL
  const url = new URL(filePath)
  // 获取pathname部分
  const pathname = url.pathname
  // 找到"/appservice"后面的内容
  const relevantPath = pathname.split('/appservice')[1]
  // 使用path模块去除文件后缀
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
