interface EventListeners {
  [type: string]: EventListener[]
}

export class UniWebSocket {
  static readonly CONNECTING: number = 0
  static readonly OPEN: number = 1
  static readonly CLOSING: number = 2
  static readonly CLOSED: number = 3

  public readonly url: string
  public readonly protocols?: string | string[]

  private socketTask: UniApp.SocketTask | null = null
  private listeners: EventListeners = {}
  private _readyState: number = UniWebSocket.CONNECTING

  public onclose: ((this: UniWebSocket, ev: CloseEvent) => any) | null = null
  public onerror: ((this: UniWebSocket, ev: Event) => any) | null = null
  public onmessage: ((this: UniWebSocket, ev: MessageEvent) => any) | null = null
  public onopen: ((this: UniWebSocket, ev: Event) => any) | null = null

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    this.init()
  }

  public get readyState(): number {
    return this._readyState
  }

  private init(): void {
    this.socketTask = uni.connectSocket({
      url: this.url,
      protocols: Array.isArray(this.protocols) ? this.protocols : this.protocols ? [this.protocols] : [],
      complete: () => {},
    })

    this.socketTask.onOpen(() => {
      this._readyState = UniWebSocket.OPEN
      this.dispatchEvent('open')
    })

    this.socketTask.onClose((event) => {
      this._readyState = UniWebSocket.CLOSED
      this.dispatchEvent('close', { code: event.code, reason: event.reason })
    })

    this.socketTask.onError((error) => {
      this.dispatchEvent('error', error)
    })

    this.socketTask.onMessage((message) => {
      this.dispatchEvent('message', { data: message.data })
    })
  }

  public addEventListener(type: string, callback: EventListener): void {
    if (!this.listeners[type]) {
      this.listeners[type] = []
    }
    this.listeners[type].push(callback)
  }

  public removeEventListener(type: string, callback: EventListener): void {
    if (this.listeners[type]) {
      const index = this.listeners[type].indexOf(callback)
      if (index !== -1) {
        this.listeners[type].splice(index, 1)
      }
    }
  }

  private dispatchEvent(type: string, event: any = {}): void {
    if (this.listeners[type]) {
      this.listeners[type].forEach(listener => listener(event))
    }
  }

  public send(data: string): void {
    if (this._readyState === UniWebSocket.OPEN && this.socketTask) {
      this.socketTask.send({
        data,
        fail: (error) => {
          console.error('WebSocket send error:', error)
        },
      })
    }
    else {
      console.error('WebSocket is not open.readyState:', this.readyState)
    }
  }

  public close(code: number = 1000, reason: string = ''): void {
    if ((this._readyState === UniWebSocket.OPEN || this._readyState === UniWebSocket.CONNECTING) && this.socketTask) {
      this.socketTask.close({
        code,
        reason,
        success: () => {
          this._readyState = UniWebSocket.CLOSING
        },
        fail: (error) => {
          console.error('WebSocket close error:', error)
        },
      })
    }
  }

  public onClose(callback: EventListener): void {
    this.addEventListener('close', callback)
  }
}
