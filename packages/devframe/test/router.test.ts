import process from 'node:process'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getRegisteredRoutesFromFs, parsePagesJsonRoutes } from '../src/devframe'

describe('parsePagesJsonRoutes', () => {
  it('解析基础 pages 列表', () => {
    const json = JSON.stringify({
      pages: [
        { path: 'pages/index', type: 'home' },
        { path: 'pages/detail', style: { navigationBarTitleText: '详情' } },
      ],
    })
    const routes = parsePagesJsonRoutes(json)
    expect(routes).toHaveLength(2)
    expect(routes[0]).toEqual({
      path: '/pages/index',
      name: 'pages/index',
      meta: { type: 'home' },
    })
    expect(routes[1]).toEqual({
      path: '/pages/detail',
      name: 'pages/detail',
      meta: { navigationBarTitleText: '详情' },
    })
  })

  it('支持带有注释的 JSONC 格式与尾随逗号', () => {
    const jsonc = `
    {
      // 页面列表
      "pages": [
        {
          "path": "pages/index",
          "type": "home",
        },
        /* 多行注释 */
        {
          "path": "pages/about",
        },
      ],
    }
    `
    const routes = parsePagesJsonRoutes(jsonc)
    expect(routes).toHaveLength(2)
    expect(routes.map(r => r.path)).toEqual(['/pages/index', '/pages/about'])
  })

  it('支持解析 subPackages 分包路径', () => {
    const json = JSON.stringify({
      pages: [{ path: 'pages/index' }],
      subPackages: [
        {
          root: 'packageA',
          pages: [
            { path: 'list' },
            { path: 'detail' },
          ],
        },
      ],
    })
    const routes = parsePagesJsonRoutes(json)
    expect(routes).toHaveLength(3)
    expect(routes[1].path).toBe('/packageA/list')
    expect(routes[1].name).toBe('packageA/list')
    expect(routes[1].meta?.subPackage).toBe('packageA')
    expect(routes[2].path).toBe('/packageA/detail')
  })

  it('异常输入返回空数组', () => {
    expect(parsePagesJsonRoutes('')).toEqual([])
    expect(parsePagesJsonRoutes('{ not valid json')).toEqual([])
  })
})

describe('getRegisteredRoutesFromFs', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('在 UNI_INPUT_DIR 指向 playground/src 时读回页面', () => {
    // 包级测试时 cwd 在 packages/devframe，需要回溯到项目根
    process.env.UNI_INPUT_DIR = resolve(process.cwd(), '../../playground/src')
    const routes = getRegisteredRoutesFromFs()
    expect(routes.length).toBeGreaterThanOrEqual(2)
    const paths = routes.map(r => r.path)
    expect(paths).toContain('/pages/index')
    expect(paths).toContain('/pages/hi')
  })
})
