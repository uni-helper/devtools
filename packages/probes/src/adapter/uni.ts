/**
 * UniApp 平台适配器
 *
 * 适用于：mp-weixin / mp-alipay / mp-baidu / mp-toutiao / h5 / app 等 uni-app 支持的所有平台
 *
 * 特点：
 * - 这是唯一允许直接访问 uni 全局变量的地方
 * - 提供统一的 API 抽象，屏蔽平台差异
 */

import type { RuntimeAdapter } from './types'

declare const uni: any
declare const getApp: () => any
declare const getCurrentPages: () => any[]

export class UniAdapter implements RuntimeAdapter {
  private uniRuntime: any

  constructor(uniInstance?: any) {
    // 显式传入 uni 实例，或从全局获取
    this.uniRuntime = uniInstance || (typeof uni !== 'undefined' ? uni : null)

    if (!this.uniRuntime) {
      console.warn(
        '[UniAdapter] uni global is not available, adapter may not work correctly',
      )
    }
  }

  get platform(): string {
    // 从 uni 获取平台信息
    try {
      const systemInfo = this.uniRuntime?.getSystemInfoSync?.()
      return systemInfo?.platform || 'mp-weixin'
    } catch {
      return 'mp-weixin' // 默认微信小程序
    }
  }

  connectSocket(url: string, protocols?: string[]) {
    if (!this.uniRuntime?.connectSocket) {
      throw new Error('[UniAdapter] uni.connectSocket is not available')
    }

    const socketTask = this.uniRuntime.connectSocket({
      url,
      protocols,
      success: () => {},
      fail: (err: any) => {
        console.error('[UniAdapter] connectSocket failed:', err)
      },
    })

    return {
      send: (data: string) => {
        socketTask.send({
          data,
          success: () => {},
          fail: (err: any) => {
            console.error('[UniAdapter] socket.send failed:', err)
          },
        })
      },
      close: () => {
        socketTask.close({
          success: () => {},
          fail: (err: any) => {
            console.error('[UniAdapter] socket.close failed:', err)
          },
        })
      },
      onOpen: (handler: () => void) => {
        socketTask.onOpen(() => {
          handler()
        })
      },
      onMessage: (handler: (data: string) => void) => {
        socketTask.onMessage((res: any) => {
          handler(res.data)
        })
      },
      onClose: (handler: (code?: number, reason?: string) => void) => {
        socketTask.onClose((res: any) => {
          handler(res.code, res.reason)
        })
      },
      onError: (handler: (error: any) => void) => {
        socketTask.onError((err: any) => {
          handler(err)
        })
      },
    }
  }

  getApp(): any {
    if (!this.uniRuntime) {
      return null
    }
    // uni-app 的 getApp 通常挂在全局
    return typeof getApp !== 'undefined' ? getApp() : null
  }

  getCurrentPages(): any[] {
    if (!this.uniRuntime) {
      return []
    }
    // uni-app 的 getCurrentPages 通常挂在全局
    return typeof getCurrentPages !== 'undefined' ? getCurrentPages() : []
  }

  getVueRuntime(): any {
    // Vue 运行时通常不直接暴露在 uni 对象上
    // 需要从页面实例或其他地方获取
    try {
      const pages = this.getCurrentPages()
      if (pages.length > 0) {
        const page = pages[0]
        // 尝试从页面实例获取 Vue 构造函数
        return page.$vm?.constructor || null
      }
    } catch {
      // ignore
    }
    return null
  }
}
