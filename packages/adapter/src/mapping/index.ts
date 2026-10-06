/**
 * 映射层：把 devframe / 探针数据结构转换为官方 Vue Devtools client 协议结构
 * （`@vue/devtools-kit` `protocol/messages.ts` 的形状）。
 *
 * 每条映射的可观测行为由 `packages/adapter/test/*.test.ts` 冻结。
 */

export * from './network.ts'
export * from './pinia.ts'
export * from './state.ts'
export * from './tree.ts'
