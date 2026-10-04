/** World-locked dotted canvas: each ×10 zoom loop is only-normal → crossfade → only-normal. */

export const DIAGRAM_STAGE_BG = '#1a1a1a'

export type DiagramGridSettings = {
  enabled: boolean
  color: string
  opacity: number
  spacing: number
  coarseEvery: number
  fadeStart: number
}

export const DEFAULT_DIAGRAM_GRID_SETTINGS: DiagramGridSettings = {
  enabled: true,
  color: '#ffffff',
  opacity: 0.16,
  spacing: 20,
  coarseEvery: 10,
  fadeStart: 0.5,
}

/** Promote to the next coarse step once fine dots are this small. */
const MIN_SCREEN = 7
/** Hysteresis when zooming back in (must be > MIN_SCREEN). */
const RESTORE_SCREEN = 11
/** Matches PixiGraphRenderer max zoom — finest loop starts here with no coarse layer. */
const MAX_ZOOM = 5

let settings: DiagramGridSettings = { ...DEFAULT_DIAGRAM_GRID_SETTINGS }
const listeners = new Set<() => void>()

function clampGridSettings(next: DiagramGridSettings): DiagramGridSettings {
  const hex = /^#[0-9a-fA-F]{6}$/.test(next.color) ? next.color.toLowerCase() : '#ffffff'
  return {
    enabled: Boolean(next.enabled),
    color: hex,
    opacity: Math.min(1, Math.max(0.02, next.opacity)),
    spacing: Math.round(Math.min(80, Math.max(8, next.spacing))),
    coarseEvery: Math.round(Math.min(20, Math.max(4, next.coarseEvery))),
    fadeStart: Math.min(0.9, Math.max(0, next.fadeStart)),
  }
}

export function getDiagramGridSettings(): DiagramGridSettings {
  return { ...settings }
}

export function setDiagramGridSettings(patch: Partial<DiagramGridSettings>): DiagramGridSettings {
  settings = clampGridSettings({ ...settings, ...patch })
  cssCacheKey = ''
  cssUrls = null
  for (const fn of listeners) fn()
  return getDiagramGridSettings()
}

export function subscribeDiagramGridSettings(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function dotFillCss(): string {
  const r = Number.parseInt(settings.color.slice(1, 3), 16)
  const g = Number.parseInt(settings.color.slice(3, 5), 16)
  const b = Number.parseInt(settings.color.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${settings.opacity})`
}

export type DotGridLod = {
  minorStep: number
  majorStep: number
  minorScreen: number
  majorScreen: number
  minorAlpha: number
  majorAlpha: number
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function pickWorldStep(zoom: number): number {
  const ratio = settings.coarseEvery
  const base = settings.spacing
  let step = base
  while (step * zoom < MIN_SCREEN && step < 2e5) step *= ratio
  while (step > base && (step / ratio) * zoom > RESTORE_SCREEN) {
    step /= ratio
  }
  return step
}

/** 0 = most zoomed in for this step (only normal dots); 1 = about to promote. */
function loopT(minorStep: number, zoom: number): number {
  const ratio = settings.coarseEvery
  const base = settings.spacing
  const zLo = MIN_SCREEN / minorStep
  const zHi =
    minorStep <= base + 1e-6
      ? MAX_ZOOM
      : MIN_SCREEN / (minorStep / ratio)
  if (!(zHi > zLo)) return zoom <= zLo ? 1 : 0
  const t = (Math.log(zHi) - Math.log(zoom)) / (Math.log(zHi) - Math.log(zLo))
  return Math.min(1, Math.max(0, t))
}

export function resolveDotGridLod(zoom: number): DotGridLod {
  const z = Math.max(zoom || 1, 0.0001)
  if (!settings.enabled) {
    return {
      minorStep: settings.spacing,
      majorStep: settings.spacing * settings.coarseEvery,
      minorScreen: settings.spacing * z,
      majorScreen: settings.spacing * settings.coarseEvery * z,
      minorAlpha: 0,
      majorAlpha: 0,
    }
  }
  const minorStep = pickWorldStep(z)
  const majorStep = minorStep * settings.coarseEvery
  const t = loopT(minorStep, z)
  const fadeStart = settings.fadeStart
  return {
    minorStep,
    majorStep,
    minorScreen: minorStep * z,
    majorScreen: majorStep * z,
    minorAlpha: 1 - smoothstep(fadeStart, 1, t),
    majorAlpha: smoothstep(fadeStart, 1, t),
  }
}

function paintDot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillRect(x, y, 1, 1)
}

function resizeCell(canvas: HTMLCanvasElement, screenSize: number): number {
  const px = Math.max(2, Math.round(screenSize))
  if (canvas.width !== px || canvas.height !== px) {
    canvas.width = px
    canvas.height = px
  }
  return px
}

/** Same 1px glyph for fine and coarse — only sprite/pattern alpha differs. */
export function paintMinorDotCell(canvas: HTMLCanvasElement, screenSize: number): number {
  const size = resizeCell(canvas, screenSize)
  const ctx = canvas.getContext('2d')
  if (!ctx) return size
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = dotFillCss()
  paintDot(ctx, 0, 0)
  return size
}

const fillMinor = document.createElement('canvas')
const fillMajor = document.createElement('canvas')
let cssCacheKey = ''
let cssUrls: { minor: string; major: string } | null = null

function patternMatrix(panX: number, panY: number, screenSize: number, texSize: number): DOMMatrix {
  const scale = screenSize / Math.max(texSize, 1)
  return new DOMMatrix().translateSelf(panX, panY).scaleSelf(scale)
}

export function fillCanvasDotGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  panX: number,
  panY: number,
  zoom: number,
): void {
  ctx.save()
  ctx.fillStyle = DIAGRAM_STAGE_BG
  ctx.fillRect(0, 0, width, height)
  const lod = resolveDotGridLod(zoom)
  if (lod.minorAlpha > 0.01) {
    const texSize = paintMinorDotCell(fillMinor, lod.minorScreen)
    const pattern = ctx.createPattern(fillMinor, 'repeat')
    if (pattern) {
      pattern.setTransform(patternMatrix(panX, panY, lod.minorScreen, texSize))
      ctx.globalAlpha = lod.minorAlpha
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, width, height)
    }
  }
  if (lod.majorAlpha > 0.01 && lod.majorScreen > 0) {
    const texSize = paintMinorDotCell(fillMajor, lod.majorScreen)
    const pattern = ctx.createPattern(fillMajor, 'repeat')
    if (pattern) {
      pattern.setTransform(patternMatrix(panX, panY, lod.majorScreen, texSize))
      ctx.globalAlpha = lod.majorAlpha
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, width, height)
    }
  }
  ctx.restore()
}

function cssDataUrls(lod: DotGridLod): { minor: string; major: string } {
  const key = [
    settings.enabled,
    settings.color,
    settings.opacity,
    settings.spacing,
    settings.coarseEvery,
    settings.fadeStart,
    Math.round(lod.minorScreen),
    Math.round(lod.majorScreen),
    lod.majorAlpha > 0 ? 1 : 0,
  ].join(':')
  if (cssUrls && cssCacheKey === key) return cssUrls
  paintMinorDotCell(fillMinor, lod.minorScreen)
  const minor = fillMinor.toDataURL()
  let major = ''
  if (lod.majorAlpha > 0 && lod.majorScreen > 0) {
    paintMinorDotCell(fillMajor, lod.majorScreen)
    major = fillMajor.toDataURL()
  }
  cssCacheKey = key
  cssUrls = { minor, major }
  return cssUrls
}

/** Screen-space CSS pattern (Konva canvas is transparent — container shows through). */
export function applyDotGridElementStyle(
  el: HTMLElement,
  panX: number,
  panY: number,
  zoom: number,
): void {
  const lod = resolveDotGridLod(zoom)
  const urls = cssDataUrls(lod)
  const pos = `${panX}px ${panY}px`
  const layers: string[] = []
  const sizes: string[] = []
  const positions: string[] = []
  if (lod.minorAlpha > 0.05) {
    layers.push(`url("${urls.minor}")`)
    sizes.push(`${lod.minorScreen}px ${lod.minorScreen}px`)
    positions.push(pos)
  }
  if (lod.majorAlpha > 0.05 && urls.major) {
    layers.push(`url("${urls.major}")`)
    sizes.push(`${lod.majorScreen}px ${lod.majorScreen}px`)
    positions.push(pos)
  }
  el.style.backgroundColor = DIAGRAM_STAGE_BG
  el.style.backgroundImage = layers.join(', ')
  el.style.backgroundSize = sizes.join(', ')
  el.style.backgroundPosition = positions.join(', ')
  el.style.backgroundRepeat = 'repeat'
}
