/**
 * 面板 URL 是否带 `?mock`（fixtures 假数据调试模式）。
 * client 侧 connection 接线与 MOCK 角标共用，保证参数名单一来源；
 * adapter 本身不读 URL，mock 与否由调用方传入。
 * 放子路径导出（不进 barrel）：探针构建会整包引入 barrel，见 index.ts 头注释。
 */
export function isMockPanelUrl(): boolean {
  // 不依赖 DOM lib（shared 同时被探针/node 构建引用）：经 globalThis 取 location
  const loc = (globalThis as { location?: { search?: string } }).location
  return new URLSearchParams(loc?.search ?? '').has('mock')
}
