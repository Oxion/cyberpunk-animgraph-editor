import { ref, type Ref } from 'vue'

const STORAGE_KEY = 'animgraph-editor.live-bridge.v1'

export type LiveBridgeConnectionSettings = {
  host: string
  port: number
  reconnectMs: number
}

export const DEFAULT_LIVE_BRIDGE_SETTINGS: LiveBridgeConnectionSettings = {
  host: '127.0.0.1',
  port: 29770,
  reconnectMs: 1000,
}

function normalizeSettings(
  partial?: Partial<LiveBridgeConnectionSettings> | null
): LiveBridgeConnectionSettings {
  const host =
    typeof partial?.host === 'string' && partial.host.trim()
      ? partial.host.trim()
      : DEFAULT_LIVE_BRIDGE_SETTINGS.host

  const portRaw = Number(partial?.port)
  const port =
    Number.isFinite(portRaw) && portRaw >= 1 && portRaw <= 65535
      ? Math.trunc(portRaw)
      : DEFAULT_LIVE_BRIDGE_SETTINGS.port

  const reconnectRaw = Number(partial?.reconnectMs)
  const reconnectMs =
    Number.isFinite(reconnectRaw) && reconnectRaw >= 0
      ? Math.trunc(reconnectRaw)
      : DEFAULT_LIVE_BRIDGE_SETTINGS.reconnectMs

  return { host, port, reconnectMs }
}

function loadFromStorage(): LiveBridgeConnectionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LIVE_BRIDGE_SETTINGS }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_LIVE_BRIDGE_SETTINGS }
    }
    return normalizeSettings(parsed as Partial<LiveBridgeConnectionSettings>)
  } catch {
    return { ...DEFAULT_LIVE_BRIDGE_SETTINGS }
  }
}

function persist(settings: LiveBridgeConnectionSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore quota / private mode
  }
}

const liveBridgeSettingsRef: Ref<LiveBridgeConnectionSettings> = ref(loadFromStorage())

export function getLiveBridgeSettings(): LiveBridgeConnectionSettings {
  return { ...liveBridgeSettingsRef.value }
}

export function setLiveBridgeSettings(
  partial: Partial<LiveBridgeConnectionSettings>
): LiveBridgeConnectionSettings {
  const next = normalizeSettings({ ...liveBridgeSettingsRef.value, ...partial })
  liveBridgeSettingsRef.value = next
  persist(next)
  return getLiveBridgeSettings()
}

export function resetLiveBridgeSettings(): LiveBridgeConnectionSettings {
  liveBridgeSettingsRef.value = { ...DEFAULT_LIVE_BRIDGE_SETTINGS }
  persist(liveBridgeSettingsRef.value)
  return getLiveBridgeSettings()
}

/** Reactive settings for Settings UI. */
export const liveBridgeSettings = liveBridgeSettingsRef
