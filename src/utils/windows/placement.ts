import type { WindowPlacementPreset } from '../../types/WindowPresent'

export const WINDOW_MARGIN = 8
export const WINDOW_CASCADE_STEP = 28
/** Floating breadcrumb sits above the taskbar inside the graph canvas. */
export const WINDOW_BREADCRUMB_RESERVE = 44
export const WINDOW_CHROME_HEADER = 38
export const WINDOW_MIN_WIDTH = 280
export const WINDOW_MIN_HEIGHT = 180

export type WindowOpenRect = { x: number; y: number; width: number; height: number }

export type WindowPlacementInput = {
  preset: WindowPlacementPreset
  width: number
  height: number
  cascadeIndex: number
  widthFraction?: number
}

export function getWindowsLayer(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector('.app-windows-layer') as HTMLElement | null
}

export function getWindowsLayerSize(layer?: HTMLElement | null): {
  width: number
  height: number
  rightInset: number
} {
  const el = layer ?? getWindowsLayer()
  const width = el?.clientWidth ?? 1200
  const height = el?.clientHeight ?? 800
  const insetRaw = el
    ? getComputedStyle(el).getPropertyValue('--app-window-right-inset').trim()
    : ''
  const rightInset = Number.parseFloat(insetRaw) || 0
  return { width, height, rightInset }
}

export function maxWindowHeightAt(y: number, layerHeight?: number): number {
  const h = layerHeight ?? getWindowsLayerSize().height
  return Math.max(
    WINDOW_MIN_HEIGHT,
    h - y - WINDOW_MARGIN - WINDOW_BREADCRUMB_RESERVE
  )
}

export function computeWindowOpenRect(input: WindowPlacementInput): WindowOpenRect {
  const layer = getWindowsLayerSize()
  const availW = Math.max(WINDOW_MIN_WIDTH, layer.width - layer.rightInset)
  const availH = Math.max(WINDOW_MIN_HEIGHT, layer.height)
  const cascade = input.cascadeIndex * WINDOW_CASCADE_STEP
  const requestedW = input.widthFraction
    ? input.widthFraction * availW
    : input.width

  if (input.preset === 'dialog') {
    const w = Math.min(requestedW, availW - 16)
    const h = Math.min(input.height, availH - 16)
    const x = Math.min(Math.max(8, 48 + cascade), Math.max(8, availW - w - 8))
    const y = Math.min(Math.max(8, 48 + cascade), Math.max(8, availH - h - 8))
    return { x, y, width: w, height: h }
  }

  const x = Math.min(
    WINDOW_MARGIN + cascade,
    Math.max(WINDOW_MARGIN, availW - WINDOW_MIN_WIDTH)
  )
  const y = WINDOW_MARGIN + cascade
  const maxH = maxWindowHeightAt(y, availH)
  const w = Math.min(Math.max(WINDOW_MIN_WIDTH, requestedW), Math.max(WINDOW_MIN_WIDTH, availW - x - WINDOW_MARGIN))

  if (input.preset === 'left-stretch') {
    return { x, y, width: w, height: maxH }
  }

  const h = Math.min(Math.max(WINDOW_MIN_HEIGHT, input.height), maxH)
  return { x, y, width: w, height: h }
}
