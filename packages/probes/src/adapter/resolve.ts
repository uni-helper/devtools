/**
 * Adapter 自动选择与解析
 *
 * 原则 P4 (Single Adapter Seam)：
 * - 按能力探测选择合适的 Adapter
 * - 新增平台 = 新增 1 个 Adapter 文件 + 1 行注册，不改 Runtime
 */

import type { RuntimeAdapter } from './types'
import { NullAdapter } from './types'
import { UniAdapter } from './uni'
import { WxAdapter } from './wx'

declare const uni: any
declare const wx: any

/**
 * 按能力自动解析 Adapter
 *
 * 优先级：
 * 1. uni（uni-app 跨平台框架，覆盖最广）
 * 2. wx（微信小程序原生 API）
 * 3. null（测试或探针缺席场景）
 */
export function resolveAdapter(): RuntimeAdapter {
  // 1. 检测 uni-app
  if (typeof uni !== 'undefined' && uni.connectSocket) {
    return new UniAdapter(uni)
  }

  // 2. 检测微信小程序原生
  if (typeof wx !== 'undefined' && wx.connectSocket) {
    return new WxAdapter(wx)
  }

  // 3. 检测全局 uni（可能被注入到 globalThis）
  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as any).uni?.connectSocket
  ) {
    return new UniAdapter((globalThis as any).uni)
  }

  // 4. 检测全局 wx（可能被注入到 globalThis）
  if (
    typeof globalThis !== 'undefined' &&
    (globalThis as any).wx?.connectSocket
  ) {
    return new WxAdapter((globalThis as any).wx)
  }

  // 5. 降级到 NullAdapter
  console.warn(
    '[resolveAdapter] No platform runtime detected, using NullAdapter',
  )
  return new NullAdapter()
}

/**
 * 创建 Adapter（提供显式传入能力）
 *
 * @param options - 配置选项
 * @param options.type - Adapter 类型：'uni' | 'wx' | 'null' | 'auto'
 * @param options.runtime - 显式传入的运行时实例
 * @returns RuntimeAdapter 实例
 */
export function createAdapter(
  options: {
    type?: 'uni' | 'wx' | 'null' | 'auto'
    runtime?: any
  } = {},
): RuntimeAdapter {
  const { type = 'auto', runtime } = options

  switch (type) {
    case 'uni':
      return new UniAdapter(runtime)
    case 'wx':
      return new WxAdapter(runtime)
    case 'null':
      return new NullAdapter()
    case 'auto':
    default:
      return resolveAdapter()
  }
}
