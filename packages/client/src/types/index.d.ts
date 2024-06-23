export interface ModuleInfo {
  id: string
  plugins: { name: string, transform?: number, resolveId?: number }[]
  deps: string[]
  virtual: boolean
}

export interface ComponentTreeNode {
  name: string
  file: string
  children?: ComponentTreeNode[]
}

/** 初始化状态 */
export interface InitState {
  /** 当前页面 */
  currentPage: string

  /** uni编译版本 */
  uniCompileVersion: string

  /** uni运行版本 */
  uniRuntimeVersion: string

  /** 当前运行平台 */
  uniPlatform: string

  /** vue版本 */
  vueVersion: string

  /** 当前页面组件 */
  components: ComponentTreeNode

  /** pinia数据 */
  piniaState: { [key: string]: any }
}
