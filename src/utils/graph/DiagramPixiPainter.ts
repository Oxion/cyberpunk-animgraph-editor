import { Container, Graphics, TextStyle } from 'pixi.js'
import { StateMachineRingPresentation, stateMachineRingChipColors } from './DiagramConversion'
import { getChipBorderPoint } from './StateMachineDetailLayout'
import { parseColor, parseColorAlpha } from './ConnectionPixiPainter'
import { createDiagramText } from './pixiText'

function strokeDashedCircle(
  g: Graphics,
  centerX: number,
  centerY: number,
  radius: number,
  strokeDash: number[],
  strokeCss: string,
  strokeWidth: number
): void {
  const color = parseColor(strokeCss)
  const alpha = parseColorAlpha(strokeCss, 1)
  const circumference = 2 * Math.PI * radius
  // if (circumference < 1e-6 || strokeDash.length === 0) {
    // g.circle(centerX, centerY, radius)
    // g.stroke({ width: strokeWidth, color: 0xffffff })
    // g.tint = color
    // g.alpha = alpha
    // return
  // }

  // let along = 0
  // let patternIndex = 0
  // while (along < circumference) {
  //   const segmentLen = strokeDash[patternIndex % strokeDash.length]
  //   const endAlong = Math.min(along + segmentLen, circumference)
  //   if (patternIndex % 2 === 0) {
  //     const startAngle = (along / circumference) * Math.PI * 2
  //     const endAngle = (endAlong / circumference) * Math.PI * 2
  //     g.arc(centerX, centerY, radius, startAngle, endAngle)
  //     g.stroke({ width: strokeWidth, color, alpha, cap: 'round', join: 'round' })
  //   }
  //   along = endAlong
  //   patternIndex += 1
  // }
}

/** Fixed white fill sizes — tint/alpha carry color so all arrows share one batch style. */
const ARROW_BODY_SHAFT = 1.5
const ARROW_OUTLINE_SHAFT = 2.25
/** Shared tip geometry — outline only grows shaft outward, not the head. */
const ARROW_POINTER_LENGTH = 7
const ARROW_POINTER_WIDTH = 7
const ARROW_FILL = { color: 0xffffff as const }
const ARROW_TIP_WING = ARROW_POINTER_WIDTH / 2
/** Pull arrow start under the source chip so the stub is covered by chip paint. */
const ARROW_START_INSET_FRAC = 0.4

type RingPoint = { x: number; y: number }

function insetTowardChipCenter(
  borderPt: RingPoint,
  chipCenter: RingPoint,
  inset: number
): RingPoint {
  const dx = chipCenter.x - borderPt.x
  const dy = chipCenter.y - borderPt.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return borderPt
  const t = Math.min(inset, len * 0.85) / len
  return { x: borderPt.x + dx * t, y: borderPt.y + dy * t }
}

type ArrowGeomSize = {
  shaft: number
}

const ARROW_BODY_SIZE: ArrowGeomSize = {
  shaft: ARROW_BODY_SHAFT,
}

const ARROW_OUTLINE_SIZE: ArrowGeomSize = {
  shaft: ARROW_OUTLINE_SHAFT,
}

function lineAxis(fromPt: RingPoint, toPt: RingPoint): {
  ux: number
  uy: number
  px: number
  py: number
} | null {
  const dx = toPt.x - fromPt.x
  const dy = toPt.y - fromPt.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  const ux = dx / len
  const uy = dy / len
  return { ux, uy, px: -uy, py: ux }
}

function createTintedArrowGraphics(label: string, tintCss: string): Graphics {
  const g = new Graphics()
  g.label = label
  g.eventMode = 'none'
  g.tint = parseColor(tintCss)
  g.alpha = parseColorAlpha(tintCss, 1)
  return g
}

function fillWhite(g: Graphics): void {
  g.fill(ARROW_FILL)
}

/** Centered shaft + head as one fill (no seam at the tip join). */
function paintCenteredArrowFill(
  g: Graphics,
  fromPt: RingPoint,
  toPt: RingPoint,
  size: ArrowGeomSize
): void {
  const axis = lineAxis(fromPt, toPt)
  if (!axis) return
  const { ux, uy, px, py } = axis
  const half = size.shaft / 2
  const baseX = toPt.x - ux * ARROW_POINTER_LENGTH
  const baseY = toPt.y - uy * ARROW_POINTER_LENGTH
  const wing = Math.max(ARROW_TIP_WING, half)

  g.moveTo(fromPt.x - px * half, fromPt.y - py * half)
  g.lineTo(baseX - px * half, baseY - py * half)
  g.lineTo(baseX - px * wing, baseY - py * wing)
  g.lineTo(toPt.x, toPt.y)
  g.lineTo(baseX + px * wing, baseY + py * wing)
  g.lineTo(baseX + px * half, baseY + py * half)
  g.lineTo(fromPt.x + px * half, fromPt.y + py * half)
  g.closePath()
  fillWhite(g)
}

type ArrowTints = { body: string; outline: string }

function drawTransitionArrow(
  host: Container,
  fromPt: RingPoint,
  toPt: RingPoint,
  tints: ArrowTints
): void {
  const outline = createTintedArrowGraphics('sm-transition-arrow-outline', tints.outline)
  paintCenteredArrowFill(outline, fromPt, toPt, ARROW_OUTLINE_SIZE)
  const body = createTintedArrowGraphics('sm-transition-arrow', tints.body)
  paintCenteredArrowFill(body, fromPt, toPt, ARROW_BODY_SIZE)
  host.addChild(outline, body)
}

/** Two parallel centered arrows (same geom as uni-dir) — avoids split-half tip/shaft seams. */
function drawBidirectionalSplitArrow(
  host: Container,
  aStart: RingPoint,
  bTip: RingPoint,
  bStart: RingPoint,
  aTip: RingPoint,
  towardB: ArrowTints,
  towardA: ArrowTints
): void {
  const axis = lineAxis(aStart, bTip)
  if (!axis) return
  const sep = ARROW_OUTLINE_SHAFT * 0.5 + 0.5
  const { px, py } = axis
  drawTransitionArrow(
    host,
    { x: aStart.x + px * sep, y: aStart.y + py * sep },
    { x: bTip.x + px * sep, y: bTip.y + py * sep },
    towardB
  )
  drawTransitionArrow(
    host,
    { x: bStart.x - px * sep, y: bStart.y - py * sep },
    { x: aTip.x - px * sep, y: aTip.y - py * sep },
    towardA
  )
}

export type StateMachineRingSimHighlight = {
  activeStateIndex: number | null
  targetStateIndex: number | null
  /** fromIndex->toIndex keys that are eligible */
  eligibleEdges?: Set<string>
  firingEdge?: string | null
  transitionProgress?: number
}

export function paintStateMachineRing(
  hostPixiContainer: Container,
  presentation: StateMachineRingPresentation,
  sim?: StateMachineRingSimHighlight | null
): void {
  const { chipWidth: chipW, chipHeight: chipH, centerX, centerY, radius } = presentation

  const circleBgGraphics = new Graphics()
  circleBgGraphics.label = 'sm-ring'
  circleBgGraphics.eventMode = 'none'
  strokeDashedCircle(circleBgGraphics, centerX, centerY, radius, [4, 6], '#3a4a5a', 1)
  hostPixiContainer.addChild(circleBgGraphics)

  const slotByIndex = new Map(presentation.chips.map((c) => [c.stateIndex, c]))
  const edgeByKey = new Map(
    presentation.transitions.map((edge) => [`${edge.fromIndex}->${edge.toIndex}`, edge])
  )
  const painted = new Set<string>()

  const tintsFor = (edge: { fromIndex: number; toIndex: number; sourceHue: number }): ArrowTints => {
    const colors = stateMachineRingChipColors(edge.sourceHue)
    const edgeKey = `${edge.fromIndex}->${edge.toIndex}`
    if (sim?.firingEdge === edgeKey) return { body: '#5ec4a8', outline: '#5ec4a8' }
    if (sim?.eligibleEdges?.has(edgeKey)) return { body: '#e8b84a', outline: '#e8b84a' }
    // Body = chip fill; outline = chip stroke (lighter source-state rim).
    return { body: colors.fill, outline: colors.stroke }
  }

  presentation.transitions.forEach((edge) => {
    const key = `${edge.fromIndex}->${edge.toIndex}`
    if (painted.has(key)) return

    const from = slotByIndex.get(edge.fromIndex)
    const to = slotByIndex.get(edge.toIndex)
    if (!from || !to) return

    const fromBorder = getChipBorderPoint(
      from.centerX,
      from.centerY,
      to.centerX,
      to.centerY,
      chipW,
      chipH
    )
    const toBorder = getChipBorderPoint(
      to.centerX,
      to.centerY,
      from.centerX,
      from.centerY,
      chipW,
      chipH
    )
    const startInset = Math.min(chipW, chipH) * ARROW_START_INSET_FRAC
    const fromStart = insetTowardChipCenter(
      fromBorder,
      { x: from.centerX, y: from.centerY },
      startInset
    )
    const toStart = insetTowardChipCenter(
      toBorder,
      { x: to.centerX, y: to.centerY },
      startInset
    )

    const reverseKey = `${edge.toIndex}->${edge.fromIndex}`
    const reverse = edgeByKey.get(reverseKey)
    painted.add(key)
    if (reverse) painted.add(reverseKey)

    if (reverse) {
      drawBidirectionalSplitArrow(
        hostPixiContainer,
        fromStart,
        toBorder,
        toStart,
        fromBorder,
        tintsFor(edge),
        tintsFor(reverse)
      )
    } else {
      drawTransitionArrow(hostPixiContainer, fromStart, toBorder, tintsFor(edge))
    }
  })

  const chipLabelStyle = new TextStyle({
    fontSize: 10,
    fontFamily: 'Arial',
    fill: '#ffffff',
  })

  presentation.chips.forEach((chip) => {
    const colors = stateMachineRingChipColors(chip.hue)
    const label = chip.label.length > 12 
      ? `${chip.label.slice(0, 12)}…` 
      : chip.label
    const chipPixiContainer = new Container()
    chipPixiContainer.eventMode = 'none'
    chipPixiContainer.x = chip.x
    chipPixiContainer.y = chip.y
    hostPixiContainer.addChild(chipPixiContainer)

    const isActive = sim?.activeStateIndex === chip.stateIndex
    const isTarget = sim?.targetStateIndex === chip.stateIndex
    
    const chipBgGraphics = new Graphics()
    chipBgGraphics.label = 'sm-chip'
    chipBgGraphics.eventMode = 'none'
    chipBgGraphics.roundRect(0, 0, chipW, chipH, 6)
    chipBgGraphics.fill({ color: parseColor(colors.fill), alpha: parseColorAlpha(colors.fill, 1) })
    chipBgGraphics.stroke({
      width: isActive || isTarget ? 2.5 : 1,
      color: parseColor(isActive ? '#5ec4a8' : isTarget ? '#e8b84a' : colors.stroke),
      alpha: 1,
    })
    chipPixiContainer.addChild(chipBgGraphics)

    const chipLabelPixiText = createDiagramText({
      text: `[${chip.stateIndex}] ${label}`,
      style: new TextStyle({
        ...chipLabelStyle,
        fill: colors.text,
        wordWrap: true,
        wordWrapWidth: chipW - 12,
      }),
    })
    chipLabelPixiText.x = 6
    chipLabelPixiText.y = 6
    chipPixiContainer.addChild(chipLabelPixiText)

    if (isActive && typeof sim?.transitionProgress === 'number' && sim.transitionProgress > 0 && sim.transitionProgress < 1) {
      const chipProgressGraphics = new Graphics()
      chipProgressGraphics.label = 'sm-chip-progress'
      chipProgressGraphics.eventMode = 'none'
      const bw = (chipW - 8) * sim.transitionProgress
      chipProgressGraphics.rect(4, chipH - 5, bw, 3)
      chipProgressGraphics.fill({ color: parseColor('#5ec4a8'), alpha: 0.95 })
      hostPixiContainer.addChild(chipProgressGraphics)
    }
  })
}
