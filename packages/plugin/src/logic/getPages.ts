import { globSync } from 'fast-glob'
import { readJsonSync } from 'fs-extra'
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
export function getPagesInfo(pagesPath?: string): [PagesJson['pages'], string] {
  const path = getPagesPath(pagesPath)
  const pagesJson = readJsonSync(path) as PagesJson
  const pages = pagesJson.pages
  return [
    pages,
    path,
  ]
}
