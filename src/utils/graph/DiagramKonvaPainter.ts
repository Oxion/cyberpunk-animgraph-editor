import Konva from 'konva'
import { StateMachineRingPresentation, stateMachineRingChipColors } from './DiagramConversion'
import { getChipBorderPoint } from './StateMachineDetailLayout'

export function paintStateMachineRing(
  group: Konva.Group,
  presentation: StateMachineRingPresentation
): void {
  const { chipWidth: chipW, chipHeight: chipH, centerX, centerY, radius } = presentation

  group.add(
    new Konva.Circle({
      x: centerX,
      y: centerY,
      radius,
      stroke: '#3a4a5a',
      strokeWidth: 1,
      dash: [4, 6],
      listening: false,
    })
  )

  const slotByIndex = new Map(presentation.chips.map((c) => [c.stateIndex, c]))

  presentation.transitions.forEach((edge) => {
    const from = slotByIndex.get(edge.fromIndex)
    const to = slotByIndex.get(edge.toIndex)
    if (!from || !to) return
    const colors = stateMachineRingChipColors(edge.sourceHue)

    const fromPt = getChipBorderPoint(
      from.centerX,
      from.centerY,
      to.centerX,
      to.centerY,
      chipW,
      chipH
    )
    const toPt = getChipBorderPoint(
      to.centerX,
      to.centerY,
      from.centerX,
      from.centerY,
      chipW,
      chipH
    )

    group.add(
      new Konva.Arrow({
        points: [fromPt.x, fromPt.y, toPt.x, toPt.y],
        stroke: colors.stroke,
        fill: colors.stroke,
        strokeWidth: 1.5,
        pointerLength: 7,
        pointerWidth: 7,
        listening: false,
        perfectDrawEnabled: false,
      })
    )
  })

  presentation.chips.forEach((chip) => {
    const colors = stateMachineRingChipColors(chip.hue)
    const label =
      chip.label.length > 12 ? `${chip.label.slice(0, 12)}…` : chip.label
    const chipGroup = new Konva.Group({ x: chip.x, y: chip.y, listening: false })
    chipGroup.add(
      new Konva.Rect({
        width: chipW,
        height: chipH,
        fill: colors.fill,
        stroke: colors.stroke,
        strokeWidth: 1,
        cornerRadius: 6,
        listening: false,
      }),
      new Konva.Text({
        text: `[${chip.stateIndex}] ${label}`,
        x: 6,
        y: 6,
        fontSize: 10,
        fontFamily: 'Arial',
        fill: colors.text,
        width: chipW - 12,
        listening: false,
      })
    )
    group.add(chipGroup)
  })
}
