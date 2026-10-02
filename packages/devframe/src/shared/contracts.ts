/**
 * 跨环境冻结契约常量（node 插桩端 ↔ mp 探针端共享，HANDOFF §5）。
 *
 * 本文件必须保持**零 import**：它会同时进入 node 侧（instrument.ts，esbuild
 * bundle）与小程序构建（agent/*，uni-app vite 构建）——任何依赖都可能破坏
 * 其中一侧（例：拖入 node:path 会炸 mp 构建，见 HANDOFF §8-6）。
 * 此前这些字面量在写端与读端各自复制三份、靠注释约定同步；收敛到这里后
 * 「多处同步」变成「一处事实」。
 */

/** 编译期插桩挂在 setup 返回的 render 函数上的闭包绑定属性名（instrument.ts 写入 ↔ agent 读取） */
export const BINDINGS_PROP = '__uni_devtools_bindings__'
