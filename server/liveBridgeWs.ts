import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Http2SecureServer } from 'node:http2'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket } from 'ws'
import {
  createLiveBridgeTcp,
  type LiveBridgeTcpSettings,
  type LiveBridgeTcpStatus,
} from './liveBridgeTcp'

/** Vite's httpServer is `http.Server | Http2SecureServer`. */
type AttachableHttpServer = HttpServer | Http2SecureServer

const LIVE_BRIDGE_WS_PATH = '/api/live-bridge'

type ClientMessage =
  | { op: 'start'; host?: string; port?: number; reconnectMs?: number }
  | { op: 'stop' }
  | { op: 'status' }

type ServerMessage =
  | { type: 'status'; enabled: boolean; connected: boolean }
  | { type: 'line'; line: string }
  | { type: 'error'; message: string }

type SocketState = {
  started: boolean
}

function sendJson(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState !== socket.OPEN) return
  socket.send(JSON.stringify(message))
}

function parseClientMessage(raw: unknown): ClientMessage | null {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
  } else if (Buffer.isBuffer(raw)) {
    try {
      data = JSON.parse(raw.toString('utf8'))
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const op = String((data as { op?: unknown }).op ?? '')
  if (op === 'start') {
    const msg = data as { host?: unknown; port?: unknown; reconnectMs?: unknown }
    return {
      op: 'start',
      host: typeof msg.host === 'string' ? msg.host : undefined,
      port: typeof msg.port === 'number' ? msg.port : Number(msg.port),
      reconnectMs:
        typeof msg.reconnectMs === 'number' ? msg.reconnectMs : Number(msg.reconnectMs),
    }
  }
  if (op === 'stop' || op === 'status') return { op }
  return null
}

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    return ''
  }
}

const attachedServers = new WeakSet<AttachableHttpServer>()

/**
 * Attach WebSocket proxy at `/api/live-bridge` that owns one shared TCP client
 * with refcounted start/stop across sockets.
 */
export function attachLiveBridgeWs(httpServer: AttachableHttpServer): () => void {
  if (attachedServers.has(httpServer)) {
    return () => {}
  }
  attachedServers.add(httpServer)

  const wss = new WebSocketServer({ noServer: true })
  const sockets = new Map<WebSocket, SocketState>()
  let startCount = 0

  const broadcastStatus = (status: LiveBridgeTcpStatus) => {
    const message: ServerMessage = {
      type: 'status',
      enabled: status.enabled,
      connected: status.connected,
    }
    for (const socket of sockets.keys()) sendJson(socket, message)
  }

  const broadcastLine = (line: string) => {
    const message: ServerMessage = { type: 'line', line }
    for (const [socket, state] of sockets) {
      if (state.started) sendJson(socket, message)
    }
  }

  const tcp = createLiveBridgeTcp({
    onLine: broadcastLine,
    onStatus: broadcastStatus,
  })

  const releaseStart = (socket: WebSocket) => {
    const state = sockets.get(socket)
    if (!state?.started) return
    state.started = false
    startCount = Math.max(0, startCount - 1)
    if (startCount === 0) tcp.stop()
    else sendJson(socket, { type: 'status', ...tcp.getStatus() })
  }

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (pathnameOf(req) !== LIVE_BRIDGE_WS_PATH) return
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  }

  httpServer.on('upgrade', onUpgrade)

  wss.on('connection', (ws) => {
    sockets.set(ws, { started: false })
    // Do not push status on connect — idle {enabled:false} would tear down the
    // renderer session before the client's start op is processed.

    ws.on('message', (raw) => {
      const msg = parseClientMessage(raw)
      if (!msg) {
        sendJson(ws, { type: 'error', message: 'invalid message' })
        return
      }

      if (msg.op === 'status') {
        sendJson(ws, { type: 'status', ...tcp.getStatus() })
        return
      }

      if (msg.op === 'stop') {
        // tcp.stop() broadcasts status when refcount hits 0
        releaseStart(ws)
        if (startCount > 0) sendJson(ws, { type: 'status', ...tcp.getStatus() })
        return
      }

      // start — tcp.start() emits status (broadcast); do not double-send
      const state = sockets.get(ws)
      if (!state) return
      const settings: Partial<LiveBridgeTcpSettings> = {
        host: msg.host,
        port: Number.isFinite(msg.port) ? msg.port : undefined,
        reconnectMs: Number.isFinite(msg.reconnectMs) ? msg.reconnectMs : undefined,
      }
      if (!state.started) {
        state.started = true
        startCount += 1
      }
      tcp.start(settings)
    })

    ws.on('close', () => {
      releaseStart(ws)
      sockets.delete(ws)
    })
  })

  return () => {
    httpServer.off('upgrade', onUpgrade)
    attachedServers.delete(httpServer)
    for (const socket of sockets.keys()) socket.close()
    sockets.clear()
    startCount = 0
    tcp.stop()
    wss.close()
  }
}
