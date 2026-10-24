/**
 * Adapter 层统一导出
 */

export type { RuntimeAdapter } from './types'
export { NullAdapter } from './types'
export { UniAdapter } from './uni'
export { WxAdapter } from './wx'
export { resolveAdapter, createAdapter } from './resolve'
