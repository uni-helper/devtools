/**
 * 映射层：把 devframe / 探针数据结构转换为官方 Vue Devtools client 协议结构
 * （`@vue/devtools-kit` `protocol/messages.ts` 的形状）。
 *
 * 每条映射的可观测行为由 `packages/panel/test/mapping/*.test.ts` 冻结。
 */

export * from './network'
export * from './pinia'
export * from './state'
export * from './tree'
