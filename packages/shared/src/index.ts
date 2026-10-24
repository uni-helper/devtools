/**
 * 跨端共享面：node 侧（core / vite / webpack）与小程序探针（probes）共用的
 * 协议类型与冻结契约常量。
 *
 * 只放**两端都要用**的东西。纯 node 工具走子路径导出（见 package.json exports），
 * 不进本 barrel——barrel 会被探针构建整包引入，多余代码只能靠 tree-shaking 兜底。
 */
export * from './constants.ts'
export * from './types.ts'
