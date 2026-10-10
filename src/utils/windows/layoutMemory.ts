import type { AppWindowType } from '../../types/AppWindow'
import {
  WINDOW_MARGIN,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  getWindowsLayerSize,
  maxWindowHeightAt,
} from './placement'

const STORAGE_KEY = 'animgraph-editor.window-layouts.v1'
/** Bucket for unsaved / pathless projects. */
export const DEFAULT_LAYOUT_KEY = '__default__'

export function layoutStorageKey(projectPath: string | null | undefined): string {
  const path = (projectPath ?? '').trim()
  return path || DEFAULT_LAYOUT_KEY
}

export type SavedWindowLayout = {
  x: number
  y: number
  width: number
  height: number
  maximized?: boolean
}

type LayoutStore = Record<string, Partial<Record<AppWindowType, SavedWindowLayout>>>

function readStore(): LayoutStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as LayoutStore
  } catch {
    return {}
  }
}

function writeStore(store: LayoutStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // ignore quota / private mode
  }
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function normalizeLayout(raw: unknown): SavedWindowLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (
    !isFiniteNumber(o.x) ||
    !isFiniteNumber(o.y) ||
    !isFiniteNumber(o.width) ||
    !isFiniteNumber(o.height)
  ) {
    return null
  }
  return {
    x: o.x,
    y: o.y,
    width: o.width,
    height: o.height,
    maximized: Boolean(o.maximized),
  }
}

/** Clamp saved geometry into the current windows layer. */
export function clampSavedLayout(
  layout: SavedWindowLayout,
  cascadeOffset = 0
): SavedWindowLayout {
  const layer = getWindowsLayerSize()
  const availW = Math.max(WINDOW_MIN_WIDTH, layer.width - layer.rightInset)
  const availH = Math.max(WINDOW_MIN_HEIGHT, layer.height)
  const width = Math.min(
    Math.max(WINDOW_MIN_WIDTH, layout.width),
    Math.max(WINDOW_MIN_WIDTH, availW - WINDOW_MARGIN * 2)
  )
  const x = Math.min(
    Math.max(WINDOW_MARGIN, layout.x + cascadeOffset),
    Math.max(WINDOW_MARGIN, availW - width - WINDOW_MARGIN)
  )
  const y = Math.min(
    Math.max(WINDOW_MARGIN, layout.y + cascadeOffset),
    Math.max(WINDOW_MARGIN, availH - WINDOW_MIN_HEIGHT - WINDOW_MARGIN)
  )
  const maxH = maxWindowHeightAt(y, availH)
  const height = Math.min(Math.max(WINDOW_MIN_HEIGHT, layout.height), maxH)
  return {
    x,
    y,
    width,
    height,
    maximized: layout.maximized,
  }
}

export function getSavedWindowLayout(
  projectPath: string | null | undefined,
  type: AppWindowType
): SavedWindowLayout | null {
  const key = layoutStorageKey(projectPath)
  const entry = readStore()[key]?.[type]
  return entry ? normalizeLayout(entry) : null
}

export function setSavedWindowLayout(
  projectPath: string | null | undefined,
  type: AppWindowType,
  layout: SavedWindowLayout
): void {
  const key = layoutStorageKey(projectPath)
  const normalized = normalizeLayout(layout)
  if (!normalized) return
  const store = readStore()
  store[key] = { ...store[key], [type]: normalized }
  writeStore(store)
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
let pending: {
  path: string | null | undefined
  type: AppWindowType
  layout: SavedWindowLayout
} | null = null

/** Debounced persist — safe to call during drag/resize. */
export function scheduleSaveWindowLayout(
  projectPath: string | null | undefined,
  type: AppWindowType,
  layout: SavedWindowLayout
): void {
  pending = { path: projectPath, type, layout }
  if (persistTimer != null) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    if (!pending) return
    setSavedWindowLayout(pending.path, pending.type, pending.layout)
    pending = null
  }, 200)
}

export function flushSaveWindowLayout(): void {
  if (persistTimer != null) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (!pending) return
  setSavedWindowLayout(pending.path, pending.type, pending.layout)
  pending = null
}
