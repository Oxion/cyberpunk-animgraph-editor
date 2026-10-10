import { computed, ref } from 'vue'
import type {
  AppWindowOpenOptions,
  AppWindowPayloadByType,
  AppWindowRect,
  AppWindowState,
  AppWindowType,
  LensWindowPayload,
  OpenWindowSpec,
  RenderStatsWindowPayload,
  SimSkeletonWindowPayload,
  SimStatusWindowPayload,
  SmRingWindowPayload,
  StateLinksWindowPayload,
} from '../types/AppWindow'
import {
  WINDOW_CASCADE_STEP,
  WINDOW_CHROME_HEADER,
  WINDOW_MIN_HEIGHT,
  computeWindowOpenRect,
  maxWindowHeightAt,
} from '../utils/windows/placement'
import {
  clampSavedLayout,
  flushSaveWindowLayout,
  getSavedWindowLayout,
  scheduleSaveWindowLayout,
  setSavedWindowLayout,
  type SavedWindowLayout,
} from '../utils/windows/layoutMemory'
import { getWindowPresentOps } from '../utils/windows/presentOps'
import {
  getWindowOpenPolicy,
  lensWindowTitle,
  stateLinksWindowTitle,
  type WindowOpenPolicy,
} from '../utils/windows/openPolicy'
import { clearWindowStack } from './windowStacks'
import { currentLoadedPath } from './loadedProjectPath'
import { activeDiagramId } from './graphProject'

let zCounter = 100

export const windows = ref<AppWindowState[]>([])
export const activeWindowId = ref<string | null>(null)

const bumpZ = () => {
  zCounter += 1
  return zCounter
}

const findPreviewWindow = (type: AppWindowType): AppWindowState | undefined => {
  return (
    windows.value.find((w) => w.type === type && w.preview && !w.minimized) ??
    windows.value.find((w) => w.type === type && w.preview)
  )
}

const activateWindow = (win: AppWindowState) => {
  win.zIndex = bumpZ()
  win.minimized = false
  activeWindowId.value = win.id
}

const nextCascadeIndex = () =>
  windows.value.filter((w) => !w.minimized && !w.maximized).length

type OpenGeometry = {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
  /** True when geometry came from per-project memory (skip auto-size). */
  fromMemory: boolean
}

const layoutSnapshot = (win: AppWindowState): SavedWindowLayout => {
  if (win.maximized && win.restoreRect) {
    return { ...win.restoreRect, maximized: true }
  }
  return {
    x: win.x,
    y: win.y,
    width: win.width,
    height: win.height,
    maximized: win.maximized,
  }
}

const persistWindowLayout = (win: AppWindowState, immediate = false) => {
  const path = currentLoadedPath.value
  const layout = layoutSnapshot(win)
  if (immediate) {
    flushSaveWindowLayout()
    setSavedWindowLayout(path, win.type, layout)
    return
  }
  scheduleSaveWindowLayout(path, win.type, layout)
}

const openRectFor = (type: AppWindowType, options: AppWindowOpenOptions = {}): OpenGeometry => {
  const ops = getWindowPresentOps(type)
  const cascadeIndex =
    ops.placement === 'dialog' ? (options.offsetIndex ?? 0) : nextCascadeIndex()
  const fallback = computeWindowOpenRect({
    preset: ops.placement,
    width: options.preferredWidth ?? ops.preferredWidth,
    widthFraction: options.preferredWidth != null ? undefined : ops.widthFraction,
    height: ops.preferredHeight,
    cascadeIndex,
  })
  const saved = getSavedWindowLayout(currentLoadedPath.value, type)
  if (!saved) {
    return { ...fallback, maximized: Boolean(options.maximized), fromMemory: false }
  }
  const clamped = clampSavedLayout(saved, cascadeIndex * WINDOW_CASCADE_STEP)
  const maximized =
    options.maximized !== undefined
      ? Boolean(options.maximized)
      : Boolean(clamped.maximized) && cascadeIndex === 0
  return {
    x: clamped.x,
    y: clamped.y,
    width: clamped.width,
    height: clamped.height,
    maximized,
    fromMemory: true,
  }
}

const normalizeOpenOptions = (
  options: AppWindowOpenOptions | number | undefined
): AppWindowOpenOptions => (typeof options === 'number' ? { offsetIndex: options } : options ?? {})

function findReusableWindow<T extends AppWindowType>(
  type: T,
  payload: AppWindowPayloadByType[T],
  preview: boolean,
  policy: WindowOpenPolicy<T>
): Extract<AppWindowState, { type: T }> | undefined {
  if (policy.reuse === 'none') return undefined
  if (policy.reuse === 'preview') {
    if (!preview) return undefined
    const existing = findPreviewWindow(type)
    return existing?.type === type
      ? (existing as Extract<AppWindowState, { type: T }>)
      : undefined
  }
  if (policy.reuse === 'singleton') {
    const existing = windows.value.find((w) => w.type === type)
    return existing?.type === type
      ? (existing as Extract<AppWindowState, { type: T }>)
      : undefined
  }
  // match
  const existing = windows.value.find(
    (w) =>
      w.type === type &&
      policy.matchExisting?.(w as Extract<AppWindowState, { type: T }>, payload)
  )
  return existing?.type === type
    ? (existing as Extract<AppWindowState, { type: T }>)
    : undefined
}

function promoteMaximized(win: AppWindowState, options: AppWindowOpenOptions) {
  if (options.maximized && !win.maximized) {
    win.restoreRect = {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height,
    }
    win.maximized = true
  }
}

function applyMinSize(
  rect: OpenGeometry,
  minSize: { width: number; height: number } | undefined
): { width: number; height: number } {
  if (rect.fromMemory || !minSize) {
    return { width: rect.width, height: rect.height }
  }
  return {
    width: Math.max(rect.width, minSize.width),
    height: Math.max(rect.height, minSize.height),
  }
}

/** Unified open path for all `AppWindowType`s. */
export function openWindow(spec: OpenWindowSpec): string {
  const options = normalizeOpenOptions(spec.options)
  const policy = getWindowOpenPolicy(spec.type)
  const payload = spec.payload as AppWindowPayloadByType[typeof spec.type]
  const preview = policy.resolvePreview(payload, options)

  const existing = findReusableWindow(spec.type, payload, preview, policy)
  if (existing) {
    existing.payload = { ...payload } as typeof existing.payload
    existing.preview = preview
    existing.title = policy.title(payload, preview)
    promoteMaximized(existing, options)
    activateWindow(existing)
    policy.afterOpen?.(existing, 'reuse')
    return existing.id
  }

  const rect = openRectFor(spec.type, options)
  const size = applyMinSize(rect, policy.minSize)
  const id = policy.makeId(payload)
  const win = {
    id,
    type: spec.type,
    title: policy.title(payload, preview),
    x: rect.x,
    y: rect.y,
    width: size.width,
    height: size.height,
    zIndex: bumpZ(),
    minimized: false,
    preview,
    maximized: rect.maximized,
    payload: { ...payload },
    ...(policy.autoSize ? { autoSizePending: !rect.fromMemory } : {}),
  } as AppWindowState

  if (rect.maximized) {
    win.restoreRect = { x: win.x, y: win.y, width: win.width, height: win.height }
  }
  windows.value.push(win)
  activeWindowId.value = id
  const created = win as Extract<AppWindowState, { type: typeof spec.type }>
  policy.afterOpen?.(created, 'create')
  return id
}

export const openLensWindow = (
  payload: LensWindowPayload,
  options: AppWindowOpenOptions | number = {}
) => openWindow({ type: 'lens', payload, options })

export const openSmRingWindow = (
  payload: SmRingWindowPayload,
  options: AppWindowOpenOptions | number = {}
) => openWindow({ type: 'sm-ring', payload, options })

export const openStateLinksWindow = (
  payload: StateLinksWindowPayload,
  options: AppWindowOpenOptions | number = {}
) => openWindow({ type: 'state-links', payload, options })

export const openSettingsWindow = () =>
  openWindow({ type: 'settings', payload: {} })

export const closeSettingsWindow = () => {
  const existing = windows.value.find((w) => w.type === 'settings')
  if (existing) closeWindow(existing.id)
}

export const isSettingsWindowOpen = computed(() =>
  windows.value.some((w) => w.type === 'settings')
)

export const toggleSettingsWindow = (open?: boolean) => {
  const shouldOpen = open ?? !isSettingsWindowOpen.value
  if (shouldOpen) openSettingsWindow()
  else closeSettingsWindow()
}

export const openRenderStatsWindow = (payload: RenderStatsWindowPayload) =>
  openWindow({ type: 'render-stats', payload: { ...payload } })

export const openSimSkeletonWindow = (payload?: Partial<SimSkeletonWindowPayload>) => {
  const diagramId = payload?.diagramId || activeDiagramId.value || 'main'
  return openWindow({ type: 'sim-skeleton', payload: { diagramId } })
}

/** Size mode when a window exists. */
export type AppWindowSizeUiState = 'minimized' | 'default' | 'maximized'

/**
 * Presentation state for window toggle buttons / chrome.
 * Priority: closed → minimized → forward → maximized → default.
 */
export type AppWindowUiState = 'closed' | 'forward' | AppWindowSizeUiState

export function resolveWindowUiState(
  win: AppWindowState | undefined | null
): AppWindowUiState {
  if (!win) return 'closed'
  if (win.minimized) return 'minimized'
  if (activeWindowId.value === win.id) return 'forward'
  if (win.maximized) return 'maximized'
  return 'default'
}

/** First window of `type` (singletons / “any of this type”). */
export function windowUiStateByType(type: AppWindowType): AppWindowUiState {
  return resolveWindowUiState(windows.value.find((w) => w.type === type))
}

export function windowUiStateById(id: string): AppWindowUiState {
  return resolveWindowUiState(windows.value.find((w) => w.id === id))
}

export const openSimStatusWindow = (_payload?: Partial<SimStatusWindowPayload>) =>
  openWindow({ type: 'sim-status', payload: {} })

export const closeWindow = (id: string) => {
  const closing = windows.value.find((w) => w.id === id)
  if (closing) persistWindowLayout(closing, true)
  windows.value = windows.value.filter((w) => w.id !== id)
  clearWindowStack(id)
  if (activeWindowId.value === id) {
    const top = windows.value.reduce<AppWindowState | null>((best, w) => {
      if (w.minimized) return best
      if (!best || w.zIndex > best.zIndex) return w
      return best
    }, null)
    activeWindowId.value = top?.id ?? null
  }
}

export const focusWindow = (id: string) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win) return
  activateWindow(win)
}

export const minimizeWindow = (id: string) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win) return
  win.minimized = true
  if (activeWindowId.value === id) {
    activeWindowId.value = null
  }
}

export const minimizeAllWindows = () => {
  for (const win of windows.value) {
    win.minimized = true
  }
  activeWindowId.value = null
}

/** Taskbar click: active → minimize; otherwise restore + activate. */
export const toggleMinimize = (id: string) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win) return
  if (activeWindowId.value === id && !win.minimized) {
    minimizeWindow(id)
    return
  }
  focusWindow(id)
}

export const updateWindowRect = (id: string, rect: AppWindowRect) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win || win.maximized) return
  win.autoSizePending = false
  if (rect.x !== undefined) win.x = rect.x
  if (rect.y !== undefined) win.y = rect.y
  if (rect.width !== undefined) win.width = rect.width
  if (rect.height !== undefined) win.height = rect.height
  persistWindowLayout(win)
}

/** Grow/shrink height to measured content, capped by the breadcrumb band. */
export const sizeWindowToContent = (id: string, contentHeight: number) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win || win.maximized || !win.autoSizePending) return
  const maxH = maxWindowHeightAt(win.y)
  const next = Math.min(
    maxH,
    Math.max(WINDOW_MIN_HEIGHT, Math.ceil(contentHeight) + WINDOW_CHROME_HEADER)
  )
  win.height = next
}

export const toggleMaximizeWindow = (id: string) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win) return
  if (win.maximized) {
    const r = win.restoreRect
    if (r) {
      win.x = r.x
      win.y = r.y
      win.width = r.width
      win.height = r.height
    }
    win.maximized = false
    win.restoreRect = undefined
  } else {
    win.restoreRect = { x: win.x, y: win.y, width: win.width, height: win.height }
    win.maximized = true
  }
  activateWindow(win)
  persistWindowLayout(win, true)
}

export const closeQuickLensWindows = () => {
  const ids = windows.value
    .filter((w) => w.type === 'lens' && w.payload.quickLens)
    .map((w) => w.id)
  ids.forEach((id) => closeWindow(id))
}

export const pinWindow = (id: string) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win || !win.preview) return
  win.preview = false
  if (win.type === 'lens') {
    if (win.payload.quickLens) win.payload.quickLens = false
    win.title = lensWindowTitle(win.payload, false)
  } else if (win.type === 'state-links') {
    win.title = stateLinksWindowTitle(win.payload, false)
  }
}

export const clearWindows = () => {
  // Keep Settings / Render Stats / Sim Skeleton across graph reloads.
  const keepType = (t: AppWindowType) =>
    t === 'settings' || t === 'render-stats' || t === 'sim-skeleton' || t === 'sim-status'
  for (const w of windows.value) {
    if (!keepType(w.type)) {
      persistWindowLayout(w, true)
      clearWindowStack(w.id)
    }
  }
  windows.value = windows.value.filter((w) => keepType(w.type))
  if (!windows.value.some((w) => w.id === activeWindowId.value)) {
    activeWindowId.value = windows.value[0]?.id ?? null
  }
}

const mapToTaskbarItem = (w: AppWindowState) => ({
  id: w.id,
  title: w.title,
  type: w.type,
  minimized: w.minimized,
  active: activeWindowId.value === w.id && !w.minimized,
  preview: w.preview,
})

export function windowProjectDiagramId(win: AppWindowState): string | null {
  if (win.type === 'lens' || win.type === 'state-links' || win.type === 'sm-ring') {
    return win.payload.projectDiagramId
  }
  return null
}

/** Windows visible for the active diagram (+ always settings / render-stats). */
export function isWindowForActiveDiagram(
  win: AppWindowState,
  diagramId: string | null
): boolean {
  const owned = windowProjectDiagramId(win)
  if (owned == null) return true
  return Boolean(diagramId && owned === diagramId)
}

export const taskbarItems = computed(() => {
  const diagramId = activeDiagramId.value
  return windows.value
    .filter((w) => isWindowForActiveDiagram(w, diagramId))
    .map(mapToTaskbarItem)
})
