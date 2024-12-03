import { globSync } from 'fast-glob'
import fs from 'fs-extra'
import JSON5 from 'json5'
import type { PagesJson } from './../types'

export function getPagesPath(pagesPath?: string) {
  if (pagesPath)
    return pagesPath

  const files = globSync('**/pages.json', {
    ignore: ['**/node_modules/**'],
  })

  if (files.length)
    return files[0]

  throw new Error('找不到pages.json文件,请配置路径')
}

/** 获取pages.json文件数据 */
export function getPagesInfo(pagesPath?: string) {
  const path = getPagesPath(pagesPath)
  const pagesJson = JSON5.parse<PagesJson>(fs.readFileSync(path, 'utf-8'))
  const tabBarSet = new Set(pagesJson.tabBar?.list.map(item => item.pagePath))

  const pages = pagesJson.pages.map(page => ({
    path: page.path,
    filePath: path.replace(/pages\.json$/, `${page.path}.vue`),
    meta: page,
    tabBar: tabBarSet.has(page.path),
  }))

  return [path, pages] as const
}
