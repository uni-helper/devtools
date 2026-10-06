/**
 * Vue 2/3 双版本共享基础 RPC 方法集与环境工具
 *
 * 契约：
 * - 仅导出 getCurrentPagesSafe、resolveRuntimeUni、createBaseRpcFunctions
 * - 纯净度：严禁 import pinia / render-code（保证 Vue 2 打包物理隔离）
 * - 强类型：createBaseRpcFunctions 返回类型显式声明，保持 Object Spread 后的类型推导
 */

import type { ClearNetworkRecordsResult, GetNetworkRecordsResult } from '../types'
import type { PageComponentTree } from './tree'
import type { ComponentStateResult, UpdateStateResult } from './state'
import { collectComponentTree, getVueRuntimeVersion } from './tree'
import { getComponentState, updateComponentState } from './state'
import { clearNetworkRecords, getNetworkRecords } from './network'
import { schedulePushComponentTree } from './push'
import { navigateInMiniProgram } from './navigate'

declare const wx: any
declare const uni: any
declare const getCurrentPages: any

/** 安全读取当前页面栈（mp 全局 getCurrentPages 可能不存在或抛错） */
export function getCurrentPagesSafe(): any[] {
  const getPages = typeof getCurrentPages === 'function'
    ? getCurrentPages
    : (typeof globalThis !== 'undefined' && typeof (globalThis as any).getCurrentPages === 'function'
        ? (globalThis as any).getCurrentPages
        : undefined)
  try {
    const pages = getPages ? getPages() : []
    return Array.isArray(pages) ? pages : []
  }
  catch {
    return []
  }
}

/** 安全解析全局 uni 或 wx 运行时 */
export function resolveRuntimeUni(runtimeHint?: any): any {
  if (runtimeHint)
    return runtimeHint
  if (typeof uni !== 'undefined')
    return uni
  if (typeof globalThis !== 'undefined' && (globalThis as any).uni)
    return (globalThis as any).uni
  if (typeof wx !== 'undefined')
    return wx
  if (typeof globalThis !== 'undefined' && (globalThis as any).wx)
    return (globalThis as any).wx
  return undefined
}

/**
 * 创建 8 个基础 RPC 方法（Vue 2/3 通用）
 *
 * 返回类型显式声明，确保 TypeScript 完整推导每个方法的签名
 */
export function createBaseRpcFunctions(): {
  'uni-devtools:agent:ping': () => number
  'uni-devtools:agent:getComponentTree': () => { pages: PageComponentTree[], vueVersion?: string }
  'uni-devtools:agent:getNetworkRecords': (params?: any) => GetNetworkRecordsResult
  'uni-devtools:agent:clearNetworkRecords': () => ClearNetworkRecordsResult
  'uni-devtools:agent:getComponentState': (params: { id: string } | string) => ComponentStateResult
  'uni-devtools:agent:updateComponentState': (params: any, maybeKey?: string, maybeVal?: unknown) => UpdateStateResult
  'uni-devtools:agent:getRouterInfo': () => {
    currentRoute: { path: string, fullPath?: string, query?: Record<string, unknown> } | null
    stack: Array<{ path: string, query?: Record<string, unknown>, options?: Record<string, unknown> }>
  }
  'uni-devtools:agent:navigate': (params: { path: string }) => Promise<{ ok: boolean, error?: string }>
} {
  return {
    'uni-devtools:agent:ping': (): number => {
      return Date.now()
    },

    'uni-devtools:agent:getComponentTree': (): { pages: PageComponentTree[], vueVersion?: string } => {
      return {
        pages: collectComponentTree(),
        vueVersion: getVueRuntimeVersion(),
      }
    },

    'uni-devtools:agent:getNetworkRecords': (params?: any): GetNetworkRecordsResult => {
      return getNetworkRecords(params)
    },

    'uni-devtools:agent:clearNetworkRecords': (): ClearNetworkRecordsResult => {
      return clearNetworkRecords()
    },

    'uni-devtools:agent:getComponentState': (params: { id: string } | string): ComponentStateResult => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentState(id)
    },

    'uni-devtools:agent:updateComponentState': (params: any, maybeKey?: string, maybeVal?: unknown): UpdateStateResult => {
      const res = typeof params === 'object' && params !== null && 'id' in params
        ? updateComponentState(params)
        : updateComponentState({ id: params, key: maybeKey!, value: maybeVal })
      schedulePushComponentTree(100)
      return res
    },

    'uni-devtools:agent:getRouterInfo': (): {
      currentRoute: { path: string, fullPath?: string, query?: Record<string, unknown> } | null
      stack: Array<{ path: string, query?: Record<string, unknown>, options?: Record<string, unknown> }>
    } => {
      const pages = getCurrentPagesSafe()
      const stack = pages.map((page: any) => {
        const rawRoute = page?.route || page?.__route__ || ''
        const path = rawRoute ? (rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`) : '/'
        const query = page?.options || page?.$page?.options || {}
        return {
          path,
          query,
          options: query,
        }
      })

      const top = stack[stack.length - 1]
      const currentRoute = top
        ? {
            path: top.path,
            fullPath: top.path,
            query: top.query,
          }
        : null

      return {
        currentRoute,
        stack,
      }
    },

    'uni-devtools:agent:navigate': (params: { path: string }): Promise<{ ok: boolean, error?: string }> => {
      const url = params?.path
      if (!url) {
        return Promise.resolve({ ok: false, error: 'Path is required' })
      }
      const uniObj = resolveRuntimeUni()
      if (!uniObj) {
        return Promise.resolve({ ok: false, error: 'uni runtime is not available' })
      }

      // 同页导航在探针侧改用 redirect 防叠栈（决策逻辑与单测见 navigate.ts）
      return navigateInMiniProgram(uniObj, url, getCurrentPagesSafe)
    },
  }
}
