/**
 * Runtime Adapter 接口
 *
 * **契约冻结承诺**：此接口一旦发布，不得随意变更。
 * 新增能力通过可选字段扩展，删除字段需要主版本号递增。
 *
 * 设计原则（P2 Late Binding）：
 * - Runtime 核心模块只依赖此接口，不出现任何平台全局变量（uni/wx/getApp/...）
 * - 每个平台实现一个 Adapter，唯一允许探测平台全局的地方
 * - Adapter 在 bootstrap 阶段显式传入，而非运行时反查
 */

/**
 * WebSocket 连接能力
 */
export interface SocketCapability {
  /**
   * 创建 WebSocket 连接
   * @param url WebSocket URL
   * @param protocols 可选的子协议数组
   * @returns 连接句柄，包含 send/close/onOpen/onMessage/onClose/onError 方法
   */
  connectSocket: (
    url: string,
    protocols?: string[],
  ) => {
    send: (data: string) => void
    close: () => void
    onOpen: (handler: () => void) => void
    onMessage: (handler: (data: string) => void) => void
    onClose: (handler: (code?: number, reason?: string) => void) => void
    onError: (handler: (error: any) => void) => void
  }
}

/**
 * 应用生命周期能力
 */
export interface AppCapability {
  /**
   * 获取应用实例
   * @returns 应用实例，包含 globalData 等属性
   */
  getApp: () => any

  /**
   * 获取当前页面栈
   * @returns 页面实例数组
   */
  getCurrentPages: () => any[]
}

/**
 * Vue 运行时能力（可选，仅当需要深度序列化时提供）
 */
export interface VueCapability {
  /**
   * 获取 Vue 运行时（Vue 2 或 Vue 3）
   * @returns Vue 构造函数或导出对象
   */
  getVueRuntime?: () => any
}

/**
 * 平台信息能力
 */
export interface PlatformCapability {
  /**
   * 平台标识符
   * @example 'mp-weixin' | 'mp-alipay' | 'mp-baidu' | 'mp-toutiao' | 'h5' | 'app'
   */
  platform: string

  /**
   * 平台版本信息（可选）
   */
  version?: string
}

/**
 * RuntimeAdapter 完整接口
 *
 * 每个平台实现此接口，提供：
 * 1. WebSocket 连接能力（必需）
 * 2. 应用生命周期能力（必需）
 * 3. Vue 运行时能力（可选）
 * 4. 平台信息（必需）
 */
export interface RuntimeAdapter
  extends SocketCapability, AppCapability, VueCapability, PlatformCapability {}

/**
 * Null Adapter（用于测试或探针缺席场景）
 */
export class NullAdapter implements RuntimeAdapter {
  platform = 'null'

  connectSocket(): any {
    return {
      send: () => {},
      close: () => {},
      onOpen: () => {},
      onMessage: () => {},
      onClose: () => {},
      onError: () => {},
    }
  }

  getApp(): any {
    return null
  }

  getCurrentPages(): any[] {
    return []
  }

  getVueRuntime(): any {
    return null
  }
}
