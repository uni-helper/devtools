import type { VitePluginVueDevToolsOptions } from 'vite-plugin-vue-devtools'

export interface Options {
  // define your plugin options here
}

export interface Pages {
  path: string
  type: string
}

export interface TabBarList {
  pagePath: string
  iconPath: string
  selectedIconPath: string
  text?: string
}

export interface PagesJson {
  pages: Pages[]
  tabBar?: {
    list: TabBarList[]
  }
}

export interface Options {
  /**
   * @default 5015
   */
  port: number

  /**
   * page.json 文件路径
   */
  pageJsonPath: string

  /**
   * vue-devtools Opthins
   */
  vueDevtoolsOptions: VitePluginVueDevToolsOptions
}
