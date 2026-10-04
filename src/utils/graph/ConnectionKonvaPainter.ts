import Konva from 'konva'
import { type PlannedConnection } from './ConnectionDrawPlanner'
import { adjustConnectionEndpointsForDrawing } from './DiagramGeometry'

export interface ConnectionKonvaStyle {
  opacity: number
  stroke?: string
  strokeWidth?: number
  strokeDash?: number[]
  showLabel?: boolean
  showArrow?: boolean
}

const LABEL_FONT_SIZE = 10
const LABEL_FONT_FAMILY = 'Arial'
const LABEL_PAD_X = 6
const LABEL_PAD_Y = 3

function measureConnectionLabel(label: string): { width: number; height: number } {
  const probe = new Konva.Text({
    text: label,
    fontSize: LABEL_FONT_SIZE,
    fontFamily: LABEL_FONT_FAMILY,
  })
  const size = { width: probe.width(), height: probe.height() }
  probe.destroy()
  return size
}

export function layoutConnectionLabel(
  midX: number,
  midY: number,
  label: string,
  opacity: number
): { rect: Konva.Rect; text: Konva.Text } {
  const measured = measureConnectionLabel(label)
  const bgWidth = measured.width + LABEL_PAD_X * 2
  const bgHeight = measured.height + LABEL_PAD_Y * 2
  const bgX = midX - bgWidth / 2
  const bgY = midY - bgHeight / 2

  const rect = new Konva.Rect({
    x: bgX,
    y: bgY,
    width: bgWidth,
    height: bgHeight,
    fill: `rgba(0, 0, 0, ${opacity * 0.7})`,
    cornerRadius: 4,
    listening: false,
  })

  const text = new Konva.Text({
    text: label,
    x: bgX,
    y: bgY,
    width: bgWidth,
    height: bgHeight,
    fontSize: LABEL_FONT_SIZE,
    fontFamily: LABEL_FONT_FAMILY,
    fill: `rgba(255, 255, 255, ${opacity})`,
    align: 'center',
    verticalAlign: 'middle',
    listening: false,
  })

  return { rect, text }
}

export function repositionConnectionLabel(
  label: Konva.Text,
  labelBg: Konva.Rect,
  midX: number,
  midY: number
): void {
  const measured = measureConnectionLabel(label.text())
  const bgWidth = measured.width + LABEL_PAD_X * 2
  const bgHeight = measured.height + LABEL_PAD_Y * 2
  const bgX = midX - bgWidth / 2
  const bgY = midY - bgHeight / 2

  labelBg.position({ x: bgX, y: bgY })
  labelBg.size({ width: bgWidth, height: bgHeight })

  label.position({ x: bgX, y: bgY })
  label.size({ width: bgWidth, height: bgHeight })
  label.align('center')
  label.verticalAlign('middle')
}

export function createPlannedConnectionShape(
  planned: PlannedConnection,
  style: ConnectionKonvaStyle
): Konva.Group {
  const stroke = style.stroke ?? `rgba(0, 255, 136, ${style.opacity})`
  const strokeWidth = style.strokeWidth ?? 2
  const showArrow = style.showArrow !== false
  const { from, to } = adjustConnectionEndpointsForDrawing(planned.from, planned.to, showArrow)

  const group = new Konva.Group({
    listening: false,
    perfectDrawEnabled: false,
  })

  group.add(
    new Konva.Line({
      points: [from.x, from.y, to.x, to.y],
      stroke,
      strokeWidth,
      dash: style.strokeDash,
      lineCap: 'round',
      listening: false,
    })
  )

  if (style.showArrow !== false) {
    group.add(
      new Konva.Arrow({
        points: [from.x, from.y, to.x, to.y],
        pointerLength: 8,
        pointerWidth: 8,
        fill: stroke,
        stroke,
        strokeWidth,
        listening: false,
      })
    )
  }

  if (style.showLabel !== false && planned.pinName) {
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const { rect, text } = layoutConnectionLabel(midX, midY, planned.pinName, style.opacity)
    group.add(rect, text)
  }

  return group
}
