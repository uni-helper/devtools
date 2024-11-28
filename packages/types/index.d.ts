export interface ModuleInfo {
  id: string
  plugins: { name: string, transform?: number, resolveId?: number }[]
  deps: string[]
  virtual: boolean
}

export interface ComponentTreeNode {
  name: string
  file: string
  id: string
  children?: ComponentTreeNode[]
}

export interface VersionState {
  /** uni运行版本 */
  uniVersion: string

  /** 当前运行平台 */
  uniPlatform: string

  /** vue版本 */
  vueVersion: string
}

/** 初始化状态 */
export interface InitState extends VersionState {
  /** 当前页面 */
  currentPage: string

  /** 当前页面组件 */
  components: ComponentTreeNode

  /** pinia数据 */
  piniaState: { [key: string]: any }
}
