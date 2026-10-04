import { computed, ref } from 'vue'
import type {
  AppWindowOpenOptions,
  AppWindowRect,
  AppWindowState,
  AppWindowType,
  LensWindowPayload,
  RenderStatsWindowPayload,
  SmRingWindowPayload,
  StateLinksWindowPayload,
} from '../types/AppWindow'
import {
  WINDOW_CHROME_HEADER,
  WINDOW_MIN_HEIGHT,
  computeWindowOpenRect,
  maxWindowHeightAt,
} from '../utils/windows/placement'
import { getWindowPresentOps } from '../utils/windows/presentOps'
import {
  clearWindowStack,
  initLensWindowStack,
  initStateLinksWindowStack,
} from './windowStacks'
import { activeDiagramId } from './graphProject'

let zCounter = 100

function lensWindowTitle(payload: LensWindowPayload, preview: boolean): string {
  const prefix = payload.quickLens ? 'Quick Lens' : preview ? 'Preview Lens' : 'Lens'
  return `${prefix} · ${payload.rootLabel}`
}

function stateLinksWindowTitle(payload: StateLinksWindowPayload, preview: boolean): string {
  const label = payload.rootLabel
  return preview ? `Preview · ${label}` : label
}

function renderStatsWindowTitle(payload: RenderStatsWindowPayload): string {
  return `Render Stats · ${payload.label}`
}

export const windows = ref<AppWindowState[]>([])
export const activeWindowId = ref<string | null>(null)

const bumpZ = () => {
  zCounter += 1
  return zCounter
}

const findPreviewWindow = (type: AppWindowType): AppWindowState | undefined => {
  return windows.value.find((w) => w.type === type && w.preview && !w.minimized)
    ?? windows.value.find((w) => w.type === type && w.preview)
}

const activateWindow = (win: AppWindowState) => {
  win.zIndex = bumpZ()
  win.minimized = false
  activeWindowId.value = win.id
}

const nextCascadeIndex = () =>
  windows.value.filter((w) => !w.minimized && !w.maximized).length

const openRectFor = (type: AppWindowType, options: AppWindowOpenOptions = {}) => {
  const ops = getWindowPresentOps(type)
  const cascadeIndex =
    ops.placement === 'dialog' ? (options.offsetIndex ?? 0) : nextCascadeIndex()
  return computeWindowOpenRect({
    preset: ops.placement,
    width: options.preferredWidth ?? ops.preferredWidth,
    widthFraction: options.preferredWidth != null ? undefined : ops.widthFraction,
    height: ops.preferredHeight,
    cascadeIndex,
  })
}

export const openLensWindow = (payload: LensWindowPayload, options: AppWindowOpenOptions | number = {}) => {
  const opts: AppWindowOpenOptions =
    typeof options === 'number' ? { offsetIndex: options } : options
  const preview = Boolean(opts.preview ?? payload.quickLens)
  const maximized = Boolean(opts.maximized)

  if (preview) {
    const existing = findPreviewWindow('lens')
    if (existing && existing.type === 'lens') {
      existing.payload = { ...payload }
      existing.preview = true
      existing.title = lensWindowTitle(payload, true)
      if (maximized && !existing.maximized) {
        existing.restoreRect = {
          x: existing.x,
          y: existing.y,
          width: existing.width,
          height: existing.height,
        }
        existing.maximized = true
      } else if (!maximized && opts.maximized === false && existing.maximized) {
        // keep maximized unless explicitly clearing — usually replace keeps maximize state
      }
      activateWindow(existing)
      initLensWindowStack(existing.id, {
        scopeRootId: payload.rootNodeId,
        label: payload.rootLabel,
        hideScopeRoot: payload.hideScopeRoot,
        projectDiagramId: payload.projectDiagramId,
      })
      return existing.id
    }
  }

  const id = `win_lens_${Date.now()}_${payload.rootNodeId}`
  const rect = openRectFor('lens', opts)
  const win: AppWindowState = {
    id,
    type: 'lens',
    title: lensWindowTitle(payload, preview),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: bumpZ(),
    minimized: false,
    preview,
    maximized,
    payload,
  }
  if (maximized) {
    win.restoreRect = { x: win.x, y: win.y, width: win.width, height: win.height }
  }
  windows.value.push(win)
  activeWindowId.value = id
  initLensWindowStack(id, {
    scopeRootId: payload.rootNodeId,
    label: payload.rootLabel,
    hideScopeRoot: payload.hideScopeRoot,
    projectDiagramId: payload.projectDiagramId,
  })
  return id
}

export const openSmRingWindow = (
  payload: SmRingWindowPayload,
  options: AppWindowOpenOptions | number = {}
) => {
  const opts: AppWindowOpenOptions =
    typeof options === 'number' ? { offsetIndex: options } : options
  const preview = Boolean(opts.preview)
  const maximized = Boolean(opts.maximized)
  const id = `win_smring_${Date.now()}_${payload.stateMachineNodeId}`
  const rect = openRectFor('sm-ring', opts)
  const win: AppWindowState = {
    id,
    type: 'sm-ring',
    title: `SM Ring · ${payload.rootLabel}`,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: bumpZ(),
    minimized: false,
    preview,
    maximized,
    payload,
  }
  if (maximized) {
    win.restoreRect = { x: win.x, y: win.y, width: win.width, height: win.height }
  }
  windows.value.push(win)
  activeWindowId.value = id
  return id
}

export const openStateLinksWindow = (
  payload: StateLinksWindowPayload,
  options: AppWindowOpenOptions | number = {}
) => {
  const opts: AppWindowOpenOptions =
    typeof options === 'number' ? { offsetIndex: options } : options
  const preview = opts.preview !== false // state-links default to preview
  const maximized = Boolean(opts.maximized)

  if (preview) {
    const existing = findPreviewWindow('state-links')
    if (existing && existing.type === 'state-links') {
      existing.payload = { ...payload }
      existing.preview = true
      existing.title = stateLinksWindowTitle(payload, true)
      if (maximized && !existing.maximized) {
        existing.restoreRect = {
          x: existing.x,
          y: existing.y,
          width: existing.width,
          height: existing.height,
        }
        existing.maximized = true
      }
      activateWindow(existing)
      initStateLinksWindowStack(existing.id, {
        stateNodeId: payload.stateNodeId,
        label: payload.rootLabel,
        stateMachineNodeId: payload.stateMachineNodeId,
        projectDiagramId: payload.projectDiagramId,
      })
      return existing.id
    }
  }

  const id = `win_statelinks_${Date.now()}_${payload.stateNodeId}`
  const rect = openRectFor('state-links', opts)
  const win: AppWindowState = {
    id,
    type: 'state-links',
    title: stateLinksWindowTitle(payload, preview),
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    zIndex: bumpZ(),
    minimized: false,
    preview,
    maximized,
    payload,
  }
  if (maximized) {
    win.restoreRect = { x: win.x, y: win.y, width: win.width, height: win.height }
  }
  windows.value.push(win)
  activeWindowId.value = id
  initStateLinksWindowStack(id, {
    stateNodeId: payload.stateNodeId,
    label: payload.rootLabel,
    stateMachineNodeId: payload.stateMachineNodeId,
    projectDiagramId: payload.projectDiagramId,
  })
  return id
}

export const openSettingsWindow = () => {
  const existing = windows.value.find((w) => w.type === 'settings')
  if (existing) {
    activateWindow(existing)
    return existing.id
  }
  const id = 'win_settings'
  const rect = openRectFor('settings')
  const win: AppWindowState = {
    id,
    type: 'settings',
    title: 'Settings',
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, 640),
    height: Math.max(rect.height, 440),
    zIndex: bumpZ(),
    minimized: false,
    preview: false,
    maximized: false,
    payload: {},
  }
  windows.value.push(win)
  activeWindowId.value = id
  return id
}

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

export const openRenderStatsWindow = (payload: RenderStatsWindowPayload) => {
  const existing = windows.value.find(
    (w) =>
      w.type === 'render-stats' &&
      w.payload.source === payload.source &&
      w.payload.sourceId === payload.sourceId
  )
  if (existing && existing.type === 'render-stats') {
    existing.payload = { ...payload }
    existing.title = renderStatsWindowTitle(payload)
    activateWindow(existing)
    return existing.id
  }

  const id = `win_render_stats_${payload.source}_${payload.sourceId}`
  const rect = openRectFor('render-stats')
  const win: AppWindowState = {
    id,
    type: 'render-stats',
    title: renderStatsWindowTitle(payload),
    x: rect.x,
    y: rect.y,
    width: Math.max(rect.width, 320),
    height: Math.max(rect.height, 180),
    zIndex: bumpZ(),
    minimized: false,
    preview: false,
    maximized: false,
    autoSizePending: true,
    payload: { ...payload },
  }
  windows.value.push(win)
  activeWindowId.value = id
  return id
}

export const closeWindow = (id: string) => {
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

export const toggleMinimize = (id: string) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win) return
  if (win.minimized) {
    focusWindow(id)
  } else {
    minimizeWindow(id)
  }
}

export const updateWindowRect = (id: string, rect: AppWindowRect) => {
  const win = windows.value.find((w) => w.id === id)
  if (!win || win.maximized) return
  win.autoSizePending = false
  if (rect.x !== undefined) win.x = rect.x
  if (rect.y !== undefined) win.y = rect.y
  if (rect.width !== undefined) win.width = rect.width
  if (rect.height !== undefined) win.height = rect.height
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
  // Keep Settings / Render Stats across graph reloads.
  const kept = windows.value.filter(
    (w) => w.type === 'settings' || w.type === 'render-stats'
  )
  for (const w of windows.value) {
    if (w.type !== 'settings' && w.type !== 'render-stats') clearWindowStack(w.id)
  }
  windows.value = kept
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
export function isWindowForActiveDiagram(win: AppWindowState, diagramId: string | null): boolean {
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

