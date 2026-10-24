/**
 * 微信小程序原生适配器
 *
 * 适用于：不使用 uni-app 框架，直接基于微信小程序原生 API 开发的应用
 *
 * 特点：
 * - 这是唯一允许直接访问 wx 全局变量的地方
 * - 仅提供微信小程序 API 的封装
 */

import type { RuntimeAdapter } from './types'

declare const wx: any
declare const getApp: () => any
declare const getCurrentPages: () => any[]

export class WxAdapter implements RuntimeAdapter {
  private wxRuntime: any

  constructor(wxInstance?: any) {
    // 显式传入 wx 实例，或从全局获取
    this.wxRuntime = wxInstance || (typeof wx !== 'undefined' ? wx : null)

    if (!this.wxRuntime) {
      console.warn(
        '[WxAdapter] wx global is not available, adapter may not work correctly',
      )
    }
  }

  get platform(): string {
    return 'mp-weixin'
  }

  get version(): string | undefined {
    try {
      const systemInfo = this.wxRuntime?.getSystemInfoSync?.()
      return systemInfo?.SDKVersion
    } catch {
      return undefined
    }
  }

  connectSocket(url: string, protocols?: string[]) {
    if (!this.wxRuntime?.connectSocket) {
      throw new Error('[WxAdapter] wx.connectSocket is not available')
    }

    const socketTask = this.wxRuntime.connectSocket({
      url,
      protocols,
      success: () => {},
      fail: (err: any) => {
        console.error('[WxAdapter] connectSocket failed:', err)
      },
    })

    return {
      send: (data: string) => {
        socketTask.send({
          data,
          success: () => {},
          fail: (err: any) => {
            console.error('[WxAdapter] socket.send failed:', err)
          },
        })
      },
      close: () => {
        socketTask.close({
          success: () => {},
          fail: (err: any) => {
            console.error('[WxAdapter] socket.close failed:', err)
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
    return typeof getApp !== 'undefined' ? getApp() : null
  }

  getCurrentPages(): any[] {
    return typeof getCurrentPages !== 'undefined' ? getCurrentPages() : []
  }

  getVueRuntime(): any {
    // 原生微信小程序可能不使用 Vue
    // 如果使用了 Vue，需要从其他地方获取
    try {
      const pages = this.getCurrentPages()
      if (pages.length > 0) {
        const page = pages[0]
        return page.$vm?.constructor || null
      }
    } catch {
      // ignore
    }
    return null
  }
}
