const DERIV_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public'

type DerivMessage = {
  echo_req?: Record<string, unknown>
  active_symbols?: unknown[]
  msg_type?: string
  subscription?: { id?: number }
  error?: { message?: string }
  ticks?: { quote?: number; epoch?: number; symbol?: string }
  history?: { prices?: number[]; times?: number[]; candles?: unknown[] }
}

export class DerivMarketService {
  private socket: WebSocket | null = null
  private connectListeners: Array<() => void> = []
  private messageListeners: Array<(payload: DerivMessage) => void> = []
  private errorListeners: Array<(message: string) => void> = []

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(DERIV_WS_URL)

        this.socket.onopen = () => {
          this.notifyConnect()
          resolve()
        }

        this.socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data) as DerivMessage
            this.messageListeners.forEach((listener) => listener(payload))
          } catch (error) {
            console.error('Failed to parse Deriv payload', error)
          }
        }

        this.socket.onerror = () => {
          this.notifyError('WebSocket error from Deriv public feed.')
        }

        this.socket.onclose = () => {
          this.notifyError('Feed disconnected. Reconnecting...')
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  onConnect(listener: () => void): void {
    this.connectListeners.push(listener)
  }

  onMessage(listener: (payload: DerivMessage) => void): void {
    this.messageListeners.push(listener)
  }

  onError(listener: (message: string) => void): void {
    this.errorListeners.push(listener)
  }

  send(message: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not ready, dropping message', message)
      return
    }
    this.socket.send(JSON.stringify(message))
  }

  requestActiveSymbols(): void {
    this.send({ active_symbols: 'brief' })
  }

  requestHistory(symbol: string, count = 250): void {
    this.send({
      ticks_history: symbol,
      count,
      end: 'latest',
      style: 'ticks'
    })
  }

  subscribeToMarket(symbol: string): void {
    this.send({
      ticks: symbol,
      subscribe: 1
    })
  }

  forgetSubscription(id: number): void {
    this.send({ forget: id })
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
  }

  private notifyConnect(): void {
    this.connectListeners.forEach((listener) => listener())
  }

  private notifyError(message: string): void {
    this.errorListeners.forEach((listener) => listener(message))
  }
}

export const derivWebSocket = new DerivMarketService()
