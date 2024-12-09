interface EventListeners {
  [type: string]: EventListener[]
}

export class UniWebSocket implements WebSocket {
  public readonly CONNECTING = 0 as const
  public readonly OPEN = 1 as const
  public readonly CLOSING = 2 as const
  public readonly CLOSED = 3 as const

  public readonly url: string
  public readonly protocol: string

  private socketTask: UniApp.SocketTask | null = null
  private listeners: EventListeners = {}
  private __readyState: number = this.CONNECTING

  public binaryType: BinaryType = 'blob'
  public bufferedAmount: number = 0
  public extensions: string = ''
  public onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null
  public onerror: ((this: WebSocket, ev: Event) => any) | null = null
  public onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null
  public onopen: ((this: WebSocket, ev: Event) => any) | null = null

  constructor(url: string, protocol?: string | string[]) {
    this.url = url
    this.protocol = Array.isArray(protocol) ? protocol.join(',') : protocol || ''
    this.init()
  }

  public get readyState(): number {
    return this.__readyState
  }

  private init(): void {
    this.socketTask = uni.connectSocket({
      url: this.url,
      protocols: this.protocol.split(','),
      complete: () => {},
    })

    this.socketTask.onOpen(() => {
      this.__readyState = this.OPEN
      this.dispatchEvent(new Event('open'))
    })

    this.socketTask.onClose((event) => {
      this.__readyState = this.CLOSED
      this.dispatchEvent(new CloseEvent('close', { code: event.code, reason: event.reason }))
    })

    this.socketTask.onError((error) => {
      this.dispatchEvent(new CustomEvent('error', { detail: { cause: error } }))
    })

    this.socketTask.onMessage((message) => {
      this.dispatchEvent(new MessageEvent('message', { data: message.data }))
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

  public dispatchEvent(event: Event): boolean {
    const type = event.type
    if (this.listeners[type]) {
      this.listeners[type].forEach(listener => listener(event))
    }
    return true
  }

  public send(data: string): void {
    if (this.__readyState === this.OPEN && this.socketTask) {
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
    if ((this.__readyState === this.OPEN || this.__readyState === this.CONNECTING) && this.socketTask) {
      this.socketTask.close({
        code,
        reason,
        success: () => {
          this.__readyState = this.CLOSING
        },
        fail: (error) => {
          console.error('WebSocket close error:', error)
        },
      })
    }
  }
}
