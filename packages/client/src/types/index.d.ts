import type { CustomTab } from '@vue/devtools-kit'
import type { MaybeRefOrGetter } from 'vue'

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

  /** uni运行版本 */
  uniVersion: string

  /** 当前运行平台 */
  uniPlatform: string

  /** vue版本 */
  vueVersion: string

  /** 当前页面组件 */
  components: ComponentTreeNode

  /** pinia数据 */
  piniaState: { [key: string]: any }
}

export interface ModuleBuiltinTab extends Pick<CustomTab, 'name' | 'icon' | 'title' | 'category'> {
  fallbackIcon?: string
  order?: number
  path: string
  show?: () => MaybeRefOrGetter<any>
  badge?: () => MaybeRefOrGetter<number | string | undefined>
  onClick?: () => void
}
