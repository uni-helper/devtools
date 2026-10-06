import { AGENT_BASE_RPC, AGENT_RPC_VUE3 } from '@uni-helper/devtools-shared'

/**
 * 探针方法名全表（通用 8 + Vue 3 专属 5）。
 *
 * 组装放在 node 侧而不是 shared，是打包约束不是风格选择：shared 若导出合并表，
 * 对象展开会让 esbuild 无法证明初始化无副作用、把整块保留进 Vue 2 预构建产物，
 * 使「零 Vue 3 污染」的 `grep -ci pinia` 判据恒假阳性（详见 shared/constants.ts）。
 * node 侧不在意这点体积。
 */
export const AGENT_RPC = {
  ...AGENT_BASE_RPC,
  ...AGENT_RPC_VUE3,
} as const
