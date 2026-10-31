import net from 'node:net'

export type LiveBridgeTcpSettings = {
  host: string
  port: number
  reconnectMs: number
}

export type LiveBridgeTcpStatus = {
  enabled: boolean
  connected: boolean
}

export const DEFAULT_LIVE_BRIDGE_TCP_SETTINGS: LiveBridgeTcpSettings = {
  host: '127.0.0.1',
  port: 29770,
  reconnectMs: 1000,
}

type Listeners = {
  onLine?: (line: string) => void
  onStatus?: (status: LiveBridgeTcpStatus) => void
}

function normalizeSettings(partial?: Partial<LiveBridgeTcpSettings>): LiveBridgeTcpSettings {
  const host =
    typeof partial?.host === 'string' && partial.host.trim()
      ? partial.host.trim()
      : DEFAULT_LIVE_BRIDGE_TCP_SETTINGS.host
  const portRaw = Number(partial?.port)
  const port =
    Number.isFinite(portRaw) && portRaw >= 1 && portRaw <= 65535
      ? Math.trunc(portRaw)
      : DEFAULT_LIVE_BRIDGE_TCP_SETTINGS.port
  const reconnectRaw = Number(partial?.reconnectMs)
  const reconnectMs =
    Number.isFinite(reconnectRaw) && reconnectRaw >= 0
      ? Math.trunc(reconnectRaw)
      : DEFAULT_LIVE_BRIDGE_TCP_SETTINGS.reconnectMs
  return { host, port, reconnectMs }
}

/** Opt-in TCP client to the game animgraph-bridge NDJSON server. */
export function createLiveBridgeTcp(listeners: Listeners = {}) {
  let settings = { ...DEFAULT_LIVE_BRIDGE_TCP_SETTINGS }
  let socket: net.Socket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  /** Idle until start(); true = do not connect/reconnect. */
  let stopping = true
  /** True only after 'connect'; writable is true while still connecting. */
  let connected = false

  const getStatus = (): LiveBridgeTcpStatus => ({
    enabled: !stopping,
    connected,
  })

  const emitStatus = () => {
    listeners.onStatus?.(getStatus())
  }

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const scheduleReconnect = () => {
    clearTimer()
    if (stopping) return
    timer = setTimeout(() => {
      timer = null
      connect()
    }, settings.reconnectMs)
  }

  const connect = () => {
    if (stopping || socket) return

    const { host, port } = settings
    const next = net.connect({ host, port })
    socket = next
    connected = false
    let buf = ''
    let closed = false

    next.setEncoding('utf8')
    next.on('connect', () => {
      connected = true
      console.log(`[live-bridge] connected to ${host}:${port}`)
      emitStatus()
    })
    next.on('data', (chunk: string) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (line.trim()) listeners.onLine?.(line)
      }
    })
    const onGone = () => {
      if (closed || socket !== next) return
      closed = true
      connected = false
      socket = null
      next.destroy()
      emitStatus()
      scheduleReconnect()
    }
    next.on('error', () => {
      // game not up yet — quiet reconnect via close
    })
    // close always fires; end alone would double-fire with close
    next.on('close', onGone)
    // no status here — wait for 'connect' or 'close' (avoids duplicate connected=false)
  }

  const restartSocket = () => {
    clearTimer()
    if (socket) {
      connected = false
      socket.destroy()
      socket = null
    }
    if (!stopping) connect()
    else emitStatus()
  }

  const start = (partial?: Partial<LiveBridgeTcpSettings>): LiveBridgeTcpStatus => {
    const next = normalizeSettings({ ...settings, ...partial })
    const hostPortChanged = next.host !== settings.host || next.port !== settings.port
    settings = next
    stopping = false
    if (hostPortChanged && socket) {
      restartSocket()
    } else if (!socket) {
      connect()
    } else {
      emitStatus()
    }
    return getStatus()
  }

  const stop = (): LiveBridgeTcpStatus => {
    stopping = true
    clearTimer()
    connected = false
    socket?.destroy()
    socket = null
    emitStatus()
    return getStatus()
  }

  return {
    start,
    stop,
    getStatus,
    getSettings: (): LiveBridgeTcpSettings => ({ ...settings }),
  }
}

export type LiveBridgeTcp = ReturnType<typeof createLiveBridgeTcp>
