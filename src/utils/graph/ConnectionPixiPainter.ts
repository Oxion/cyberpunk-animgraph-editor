import {
  CanvasTextMetrics,
  Container,
  Graphics,
  TextStyle,
} from 'pixi.js'
import { type PlannedConnection } from './ConnectionDrawPlanner'
import { createDiagramText, DIAGRAM_FONT_FAMILY, type DiagramText } from './pixiText'
import { NodeElsContainer } from '../PixiGraphrenderer.types'
import type { DiagramConnection } from './diagramTypes'
import { getConnectionKey } from './diagramModel'

export interface ConnectionPixiStyle {
  opacity: number
  stroke?: string
  strokeWidth?: number
  strokeDash?: number[]
  showLabel?: boolean
  showArrow?: boolean
}

const LABEL_FONT_SIZE = 10
const LABEL_FONT_FAMILY = DIAGRAM_FONT_FAMILY
const LABEL_PAD_X = 6
const LABEL_PAD_Y = 3
/** Minimum horizontal handle length for long Blender-like noodles. */
const BEZIER_HANDLE_MIN = 40
/** Cap handle vs total length so short links stay smooth (no zigzag). */
const BEZIER_HANDLE_DIST_FRAC = 0.4

export type Point2 = { x: number; y: number }

/** Horizontal cubic controls: out goes right, in comes from left (Blender noodle). */
export function blenderBezierControls(from: Point2, to: Point2): { c1: Point2; c2: Point2 } {
  const dx = Math.abs(to.x - from.x)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const handle = Math.min(
    Math.max(dx * 0.5, BEZIER_HANDLE_MIN),
    Math.max(dist * BEZIER_HANDLE_DIST_FRAC, 1)
  )
  return {
    c1: { x: from.x + handle, y: from.y },
    c2: { x: to.x - handle, y: to.y },
  }
}

export function cubicBezierPoint(
  p0: Point2,
  p1: Point2,
  p2: Point2,
  p3: Point2,
  t: number
): Point2 {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  const uuu = uu * u
  const ttt = tt * t
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  }
}

export function cubicBezierTangent(
  p0: Point2,
  p1: Point2,
  p2: Point2,
  p3: Point2,
  t: number
): Point2 {
  const u = 1 - t
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  }
}

export function sampleCubicBezier(
  from: Point2,
  c1: Point2,
  c2: Point2,
  to: Point2,
  segments = 8
): Point2[] {
  const n = Math.max(1, segments)
  const pts: Point2[] = []
  for (let i = 0; i <= n; i++) {
    pts.push(cubicBezierPoint(from, c1, c2, to, i / n))
  }
  return pts
}

/** Sampled polyline of the Blender-style connection (for tiling / dash). */
export function sampleBlenderConnection(from: Point2, to: Point2, segments = 8): Point2[] {
  const { c1, c2 } = blenderBezierControls(from, to)
  return sampleCubicBezier(from, c1, c2, to, segments)
}

const labelTextStyle = new TextStyle({
  fontSize: LABEL_FONT_SIZE,
  fontFamily: LABEL_FONT_FAMILY,
  align: 'center',
})

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.max(0, Math.min(1, s))
  const light = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * light - 1)) * sat
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = light - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (hue < 60) {
    r = c
    g = x
  } else if (hue < 120) {
    r = x
    g = c
  } else if (hue < 180) {
    g = c
    b = x
  } else if (hue < 240) {
    g = x
    b = c
  } else if (hue < 300) {
    r = x
    b = c
  } else {
    r = c
    b = x
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

export function parseColor(css: string): number {
  const trimmed = css.trim()
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return (r << 16) + (g << 8) + b
    }
    if (hex.length >= 6) {
      return parseInt(hex.slice(0, 6), 16)
    }
  }
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i
  )
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    return (r << 16) + (g << 8) + b
  }
  const hslMatch = trimmed.match(
    /^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%\s*[, ]\s*([\d.]+)%/i
  )
  if (hslMatch) {
    const [r, g, b] = hslToRgb(
      Number(hslMatch[1]),
      Number(hslMatch[2]) / 100,
      Number(hslMatch[3]) / 100
    )
    return (r << 16) + (g << 8) + b
  }
  return 0x00ff88
}

export function parseColorAlpha(css: string, fallbackAlpha = 1): number {
  const trimmed = css.trim()
  const rgbaMatch = trimmed.match(
    /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/i
  )
  if (rgbaMatch) return Number(rgbaMatch[1])
  return fallbackAlpha
}

/** Mix overlay onto base (0 = base, 1 = overlay). Returns `#rrggbb`. */
export function overlayCssColor(baseCss: string, overlayCss: string, amount: number): string {
  const t = Math.max(0, Math.min(1, amount))
  const base = parseColor(baseCss)
  const over = parseColor(overlayCss)
  const mixCh = (shift: number) => {
    const b = (base >> shift) & 0xff
    const o = (over >> shift) & 0xff
    return Math.round(b + (o - b) * t)
  }
  const r = mixCh(16)
  const g = mixCh(8)
  const b = mixCh(0)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

const labelMeasureCache = new Map<string, { width: number; height: number }>()

function measureConnectionLabel(label: string): { width: number; height: number } {
  const cached = labelMeasureCache.get(label)
  if (cached) return cached
  const metrics = CanvasTextMetrics.measureText(label, labelTextStyle)
  const result = {
    width: metrics.width,
    height: metrics.height || LABEL_FONT_SIZE,
  }
  labelMeasureCache.set(label, result)
  return result
}

const GLOBAL_LINK_STYLE = { 
  width: 2, 
  color: 0xffffff 
};

function drawConnectionLineIntoGraphics(
  g: Graphics,
  from: { x: number; y: number },
  to: { x: number; y: number },
  strokeCss: string,
): void {
  const { c1, c2 } = blenderBezierControls(from, to)
  g.clear()
  g.moveTo(from.x, from.y)
  g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y)
  g.stroke(GLOBAL_LINK_STYLE)
  g.tint = parseColor(strokeCss)
}

/** Inset endpoints along curve tangents so stroke/arrow sit cleanly on pins. */
export function adjustBezierEndpointsForDrawing(
  from: { x: number; y: number },
  to: { x: number; y: number },
  showArrow = true
): {
  from: { x: number; y: number }
  to: { x: number; y: number }
  tip: { x: number; y: number }
  endTangent: { x: number; y: number }
} {
  const { c1, c2 } = blenderBezierControls(from, to)
  const startT = cubicBezierTangent(from, c1, c2, to, 0)
  const endT = cubicBezierTangent(from, c1, c2, to, 1)
  const startLen = Math.hypot(startT.x, startT.y)
  const endLen = Math.hypot(endT.x, endT.y)
  const startInset = 1
  const endInset = 1 + (showArrow ? 8 : 1)
  const sux = startLen > 1e-6 ? startT.x / startLen : 1
  const suy = startLen > 1e-6 ? startT.y / startLen : 0
  const eux = endLen > 1e-6 ? endT.x / endLen : 1
  const euy = endLen > 1e-6 ? endT.y / endLen : 0
  return {
    from: { x: from.x + sux * startInset, y: from.y + suy * startInset },
    to: { x: to.x - eux * endInset, y: to.y - euy * endInset },
    tip: { ...to },
    endTangent: { x: eux, y: euy },
  }
}

export function layoutConnectionLabelPixi(
  midX: number,
  midY: number,
  label: string,
  opacity: number
): { rect: Graphics; text: DiagramText } {
  const rect = new Graphics()
  rect.label = 'conn-label-bg'
  rect.eventMode = 'none'

  const text = createDiagramText({
    text: label,
    style: new TextStyle({
      ...labelTextStyle,
      fill: `rgba(255, 255, 255, ${opacity})`,
      align: 'center',
    }),
  })
  text.label = 'conn-label'
  text.anchor.set(0.5, 0.5)

  applyConnectionLabelAppearance(text, rect, midX, midY, label, {
    kind: 'target',
    opacity,
  })

  return { rect, text }
}

export type ConnectionLabelKind = 'source' | 'target'

export interface ConnectionLabelAppearance {
  kind?: ConnectionLabelKind
  opacity?: number
  /** Override full label string (icon + text already composed by caller). */
  text?: string
}

/** Target (hidden input): dark badge, white text. Source (hidden output): amber badge. */
export function applyConnectionLabelAppearance(
  label: DiagramText,
  labelBg: Graphics,
  midX: number,
  midY: number,
  text: string,
  appearance?: ConnectionLabelAppearance
): void {
  const opacity = appearance?.opacity ?? 1
  const kind = appearance?.kind ?? 'target'
  const display = appearance?.text ?? text

  label.text = display
  label.alpha = opacity
  if (kind === 'source') {
    label.style.fill = '#ffdca0'
  } else {
    label.style.fill = '#ffffff'
  }

  const measured = measureConnectionLabel(display)
  const bgWidth = measured.width + LABEL_PAD_X * 2
  const bgHeight = measured.height + LABEL_PAD_Y * 2
  const bgX = midX - bgWidth / 2
  const bgY = midY - bgHeight / 2

  labelBg.clear()
  labelBg.roundRect(bgX, bgY, bgWidth, bgHeight, 4)
  if (kind === 'source') {
    labelBg.fill({ color: 0x3a2a12, alpha: 0.82 * opacity })
    labelBg.roundRect(bgX, bgY, bgWidth, bgHeight, 4)
    labelBg.stroke({ width: 1, color: 0xd4a04a, alpha: 0.85 * opacity })
  } else {
    labelBg.fill({ color: 0x000000, alpha: 0.7 * opacity })
  }

  label.anchor.set(0.5, 0.5)
  label.x = midX
  label.y = midY
}

export function repositionConnectionLabel(
  label: DiagramText,
  labelBg: Graphics,
  midX: number,
  midY: number,
  appearance?: ConnectionLabelAppearance
): void {
  const labelText =
    appearance?.text ?? (typeof label.text === 'string' ? label.text : String(label.text ?? ''))
  applyConnectionLabelAppearance(label, labelBg, midX, midY, labelText, appearance)
}

const CONNECTION_PIXI_CONTAINER_LABEL = 'conn-container'
const CONNECTION_PIXI_CONTAINER_LINE_GRAPHICS_LABEL = 'conn-line'

export interface ConnectionShapeContainer extends Container {
  lineFrom: { x: number; y: number }
  lineTo: { x: number; y: number }
}

export type ConnectionPixiContainerProps = {
  lineFrom: { x: number; y: number }
  lineTo: { x: number; y: number }
  connectionKey: string
  connection: DiagramConnection
  nodeFromId: string
  nodeToId: string
  nodeToPinName?: string
}

export class ConnectionPixiContainer extends Container {
  
  #lineFrom: { x: number; y: number }
  #lineTo: { x: number; y: number }
  #connectionKey: string
  #connection: DiagramConnection
  
  constructor(props: ConnectionPixiContainerProps) {
    super()
    this.label = CONNECTION_PIXI_CONTAINER_LABEL
    this.eventMode = 'none'
    this.#lineFrom = props.lineFrom
    this.#lineTo = props.lineTo
    this.connection = props.connection
    this.#connectionKey = getConnectionKey(props.connection)
    this.#connection = props.connection
  }

  get lineFrom(): { x: number; y: number } {
    return this.#lineFrom
  }

  set lineFrom(value: { x: number; y: number }) {
    this.#lineFrom = value
  }

  get lineTo(): { x: number; y: number } {
    return this.#lineTo
  }

  set lineTo(value: { x: number; y: number }) {
    this.#lineTo = value
  }

  get connectionKey(): string {
    return this.#connectionKey
  }

  get connection(): DiagramConnection {
    return this.#connection
  }

  set connection(value: DiagramConnection) {
    this.#connection = value
    this.#connectionKey = getConnectionKey(value)
  }
}

export function createConnectionPixiContainer(
  nodeElsContainer: NodeElsContainer,
  connection: DiagramConnection,
  planned: PlannedConnection,
  style: ConnectionPixiStyle
): ConnectionPixiContainer {
  const stroke = style.stroke ?? `rgba(0, 255, 136, ${style.opacity})`
  const adjusted = adjustBezierEndpointsForDrawing(planned.from, planned.to, false)

  const connectionPixiContainer = new ConnectionPixiContainer({
    lineFrom: { ...planned.from },
    lineTo: { ...planned.to },
    connectionKey: getConnectionKey(connection),
    connection,
    nodeFromId: connection.from,
    nodeToId: connection.to,
    nodeToPinName: connection.pinName,
  })

  const lineGraphics = new Graphics()
  connectionPixiContainer.addChild(lineGraphics)
  /** @todo uncomment after nodeElsContainer test */
  nodeElsContainer.graphics.add(lineGraphics)

  lineGraphics.label = CONNECTION_PIXI_CONTAINER_LINE_GRAPHICS_LABEL
  lineGraphics.eventMode = 'none'
  drawConnectionLineIntoGraphics(
    lineGraphics,
    adjusted.from,
    adjusted.to,
    stroke,
  )

  return connectionPixiContainer
}

export function redrawConnectionPixiContainerLine(
  connectionPixiContainer: ConnectionPixiContainer,
  lineColorHex: string,
): void {
  const lineGraphics = connectionPixiContainer.getChildByLabel(CONNECTION_PIXI_CONTAINER_LINE_GRAPHICS_LABEL)
  if (!(lineGraphics instanceof Graphics)) return

  const adjusted = adjustBezierEndpointsForDrawing(
    connectionPixiContainer.lineFrom, 
    connectionPixiContainer.lineTo, 
    false
  )

  drawConnectionLineIntoGraphics(
    lineGraphics,
    adjusted.from,
    adjusted.to,
    lineColorHex,
  )
}

/** Midpoint on the Blender curve between two endpoints (for labels). */
export function blenderConnectionMidpoint(from: Point2, to: Point2): Point2 {
  const { c1, c2 } = blenderBezierControls(from, to)
  return cubicBezierPoint(from, c1, c2, to, 0.5)
}
