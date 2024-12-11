import type { VitePluginVueDevToolsOptions } from 'vite-plugin-vue-devtools'

export interface Options {
  // define your plugin options here
}

export interface Pages {
  path: string
  tabBar: boolean
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
   * 启动编辑器
   *
   * @default 'code'
   */
  launchEditor?: 'appcode' | 'atom' | 'atom-beta' | 'brackets' | 'clion' | 'code' | 'code-insiders' | 'codium' | 'emacs' | 'idea' | 'notepad++' | 'pycharm' | 'phpstorm' | 'rubymine' | 'sublime' | 'vim' | 'visualstudio' | 'webstorm' | 'rider' | string

  /**
   * vue-devtools Opthins
   */
  vueDevtoolsOptions: VitePluginVueDevToolsOptions
  /**
   * 打开客户端
   * @default false
   */
  openDesktop: boolean
  /**
   * 打开浏览器
   * @default false
   */
  openBrowser: boolean
}

export interface ModuleInfo {
  id: string
  plugins: { name: string, transform?: number, resolveId?: number }[]
  deps: string[]
  virtual: boolean
}

export type AssetType = 'image' | 'font' | 'video' | 'audio' | 'text' | 'json' | 'wasm' | 'other'
export interface AssetInfo {
  path: string
  type: AssetType
  publicPath: string
  filePath: string
  size: number
  mtime: number
  base64: string
}

export interface ConsoleInfo {
  type: string
  messages: string
  file: string
}
