// uni-devtools：官方 kit 的类型扩展。
// 两处都是「我们注册了官方没声明的成员」，官方文档也邀请这样扩展
// （protocol/requests.ts 的 RuntimeCommandMap 注释：
//  "Built-in request contracts. Extend these interfaces to type additional registered methods."）。
import '@vue/devtools-kit'

declare module '@vue/devtools-kit' {
  interface DevtoolsCapabilitiesMessage {
    /** uni-devtools: vite inspect iframe 门控 */
    inspect?: boolean
  }

  interface RuntimeCommandMap {
    /** uni-devtools: 把 vite:core:open-in-editor 桥接到探针的 open-in-editor */
    'components:openInEditor': { file: string }
  }
}
