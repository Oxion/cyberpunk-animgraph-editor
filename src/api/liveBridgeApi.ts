import { isElectron } from '../utils/platform'
import type { LiveBridgeConnectionSettings } from '../stores/liveBridgeSettings'

export type LiveBridgeStatus = { enabled: boolean; connected: boolean }

export type { LiveBridgeConnectionSettings }

type StatusHandler = (status: LiveBridgeStatus) => void
type LineHandler = (line: string) => void

function electronApi() {
  const api = window.electronAPI
  if (!api) throw new Error('electronAPI is not available')
  return api
}

/** WebSocket client for `/api/live-bridge` (web only). */
class BrowserLiveBridge {
  private _socket: WebSocket | null = null
  private _openPromise: Promise<WebSocket> | null = null
  private readonly _lineHandlers = new Set<LineHandler>()
  private readonly _statusHandlers = new Set<StatusHandler>()
  private readonly _pendingStatus = new Set<(status: LiveBridgeStatus) => void>()
  private _lastStatus: LiveBridgeStatus = { enabled: false, connected: false }

  start(settings: LiveBridgeConnectionSettings): Promise<LiveBridgeStatus> {
    return this._request({
      op: 'start',
      host: settings.host,
      port: settings.port,
      reconnectMs: settings.reconnectMs,
    })
  }

  stop(): Promise<LiveBridgeStatus> {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
      this._lastStatus = { enabled: false, connected: false }
      return Promise.resolve(this._lastStatus)
    }
    return this._request({ op: 'stop' })
  }

  status(): Promise<LiveBridgeStatus> {
    if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve(this._lastStatus)
    }
    return this._request({ op: 'status' })
  }

  onLine(handler: LineHandler): () => void {
    this._lineHandlers.add(handler)
    return () => {
      this._lineHandlers.delete(handler)
    }
  }

  onStatus(handler: StatusHandler): () => void {
    this._statusHandlers.add(handler)
    return () => {
      this._statusHandlers.delete(handler)
    }
  }

  private _emitStatus(status: LiveBridgeStatus) {
    this._lastStatus = status
    for (const pending of [...this._pendingStatus]) {
      this._pendingStatus.delete(pending)
      pending(status)
    }
    for (const handler of this._statusHandlers) handler(status)
  }

  private _emitLine(line: string) {
    for (const handler of this._lineHandlers) handler(line)
  }

  private _wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/api/live-bridge`
  }

  private _ensureSocket(): Promise<WebSocket> {
    if (this._socket?.readyState === WebSocket.OPEN) return Promise.resolve(this._socket)
    if (this._openPromise) return this._openPromise

    this._openPromise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this._wsUrl())
      this._socket = ws

      const fail = (err: Error) => {
        if (this._socket === ws) this._socket = null
        this._openPromise = null
        reject(err)
      }

      ws.addEventListener('open', () => {
        this._openPromise = null
        resolve(ws)
      })
      ws.addEventListener('message', (event) => {
        let data: unknown
        try {
          data = JSON.parse(String(event.data ?? ''))
        } catch {
          return
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return
        const type = String((data as { type?: unknown }).type ?? '')
        if (type === 'line') {
          const line = String((data as { line?: unknown }).line ?? '')
          if (line) this._emitLine(line)
          return
        }
        if (type === 'status') {
          this._emitStatus({
            enabled: Boolean((data as { enabled?: unknown }).enabled),
            connected: Boolean((data as { connected?: unknown }).connected),
          })
        }
      })
      ws.addEventListener('close', () => {
        if (this._socket === ws) this._socket = null
        this._openPromise = null
        this._emitStatus({ enabled: false, connected: false })
      })
      ws.addEventListener('error', () => {
        if (ws.readyState !== WebSocket.OPEN) {
          fail(new Error('Live bridge WebSocket failed'))
        }
      })
    })

    return this._openPromise
  }

  /** Send a client op and resolve with the next status push from the server. */
  private _request(payload: Record<string, unknown>): Promise<LiveBridgeStatus> {
    return this._ensureSocket().then(
      (ws) =>
        new Promise<LiveBridgeStatus>((resolve, reject) => {
          const timer = setTimeout(() => {
            this._pendingStatus.delete(onStatus)
            reject(new Error('Live bridge status timeout'))
          }, 5000)
          const onStatus = (status: LiveBridgeStatus) => {
            clearTimeout(timer)
            resolve(status)
          }
          try {
            // Register waiter after send so an earlier buffered status cannot resolve us.
            ws.send(JSON.stringify(payload))
            this._pendingStatus.add(onStatus)
          } catch (err) {
            clearTimeout(timer)
            this._pendingStatus.delete(onStatus)
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
    )
  }
}

const browserLiveBridge = new BrowserLiveBridge()

export async function liveBridgeStart(
  settings: LiveBridgeConnectionSettings
): Promise<LiveBridgeStatus> {
  if (isElectron()) return electronApi().liveBridgeStart(settings)
  return browserLiveBridge.start(settings)
}

export async function liveBridgeStop(): Promise<LiveBridgeStatus> {
  if (isElectron()) return electronApi().liveBridgeStop()
  return browserLiveBridge.stop()
}

export async function liveBridgeStatus(): Promise<LiveBridgeStatus> {
  if (isElectron()) return electronApi().liveBridgeStatus()
  return browserLiveBridge.status()
}

export function onLiveBridgeLine(handler: LineHandler): () => void {
  if (isElectron()) return electronApi().onLiveBridgeLine(handler)
  return browserLiveBridge.onLine(handler)
}

export function onLiveBridgeStatus(handler: StatusHandler): () => void {
  if (isElectron()) return electronApi().onLiveBridgeStatus(handler)
  return browserLiveBridge.onStatus(handler)
}
