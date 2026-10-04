/**
 * Pixi painter for NodeRow frames — text rows + SM ring host.
 *
 * Singular paint: `paintNodeRows`. Gesture resize updates geometry in place via
 * `syncNodeRowsToContentWidth` (no destroy/recreate — avoids Pixi RenderGroup jump).
 */

import { Container, Graphics } from 'pixi.js'
import {
  PROPERTY_ROW_FONT_SIZE,
  SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT,
} from './DiagramConversion'
import { paintStateMachineRing } from './DiagramPixiPainter'
import { parseColor } from './ConnectionPixiPainter'
import { DIAGRAM_STAGE_BG } from './diagramDotGrid'
import { createDiagramText, isDiagramText, type DiagramText } from './pixiText'
import {
  ellipsizeDiagramText,
  ROW_TEXT_HORIZONTAL_PAD,
  rowLabelMaxTextWidth,
} from './diagramTextMetrics'
import type { NodeRowFrame, NodeRowLayout } from './NodeRowModel'
import { NOTE_FOOTER_PAD_X } from './diagramFrameNodes'

export const NODE_ROWS_HOST = 'node-rows'
export const NODE_ROW_SM_RING = 'node-row-sm-ring'
export const NODE_ROW_SM_RING_BG = 'node-row-sm-ring-bg'
export const NODE_ROW_RING_CONTENT = 'node-row-ring-content'
export const NODE_ROW_TEXT = 'node-row-text'

const DEFAULT_ROW_FILL = '#ffffff'
const MULTILINE_FILL = '#7aa48c'
const NOTE_ROW_FILL = 'rgba(240, 220, 150, 0.95)'
const NOTE_ROW_FONT_SIZE = 12
/** Same as canvas — darker than NODE_CHROME_BODY so chromatic chips stay clean. */
const SM_RING_ROW_BG = DIAGRAM_STAGE_BG
/** Keep inside node stroke (1px) + bottom corner radius (matches NODE_CORNER_RADIUS). */
const SM_RING_ROW_BG_INSET = 1
const SM_RING_ROW_BG_CORNER = 7

type RowTextMeta = {
  alignRight?: boolean
  leftPad?: number
  rightPad?: number
  wordWrap?: boolean
  /** Full label before ellipsis (resize sync). */
  originalLabel?: string
}

type SmRingContainerMeta = {
  rowHeight: number
  panelWidth: number
}

const DEFAULT_SM_RING_CONTAINER_META: SmRingContainerMeta = {
  rowHeight: 0,
  panelWidth: 0,
}

const pixiContainerToSmRingContainerMetaWeakMap = new WeakMap<Container, SmRingContainerMeta>()

const getSmRingContainerMeta = (pixiContainer: Container): SmRingContainerMeta => {
  return pixiContainerToSmRingContainerMetaWeakMap.get(pixiContainer) ?? DEFAULT_SM_RING_CONTAINER_META
}

const setSmRingContainerMeta = (pixiContainer: Container, meta: SmRingContainerMeta): void => {
  pixiContainerToSmRingContainerMetaWeakMap.set(pixiContainer, meta)
}

function destroyChildren(container: Container): void {
  const removed = container.removeChildren()
  for (const child of removed) {
    try {
      child.parentRenderLayer?.detach(child)
      child.destroy({ children: true })
    } catch {
      /* ignore */
    }
  }
}

function ensureNodeRowsPixiContainer(hostPixiContainer: Container): Container {
  let nodeRowsPixiContainer = hostPixiContainer.getChildByLabel(NODE_ROWS_HOST)
  if (nodeRowsPixiContainer) return nodeRowsPixiContainer
  
  nodeRowsPixiContainer = new Container()
  nodeRowsPixiContainer.label = NODE_ROWS_HOST
  nodeRowsPixiContainer.eventMode = 'none'
  hostPixiContainer.addChild(nodeRowsPixiContainer)
  
  return nodeRowsPixiContainer
}

function paintSmRingBackground(hostGraphics: Graphics, contentWidth: number, frameHeight: number): void {
  const inset = SM_RING_ROW_BG_INSET
  const r = Math.min(
    SM_RING_ROW_BG_CORNER,
    (contentWidth - inset * 2) / 2,
    Math.max(0, frameHeight - inset)
  )
  const x0 = inset
  const x1 = contentWidth - inset
  const y1 = frameHeight - inset
  hostGraphics.clear()
  hostGraphics.moveTo(x0, 0)
  hostGraphics.lineTo(x1, 0)
  hostGraphics.lineTo(x1, y1 - r)
  if (r > 0) hostGraphics.quadraticCurveTo(x1, y1, x1 - r, y1)
  else hostGraphics.lineTo(x1, y1)
  hostGraphics.lineTo(x0 + r, y1)
  if (r > 0) hostGraphics.quadraticCurveTo(x0, y1, x0, y1 - r)
  else hostGraphics.lineTo(x0, y1)
  hostGraphics.lineTo(x0, 0)
  hostGraphics.fill({ color: 0xffffff })
  hostGraphics.tint = parseColor(SM_RING_ROW_BG)
}

function ringContentOffsetX(contentWidth: number, panelWidth: number): number {
  return Math.max(0, (contentWidth - panelWidth) / 2)
}

function paintTextRow(
  host: Container,
  frame: NodeRowFrame,
  label: string,
  fill: string,
  options: {
    leftPad?: number
    alignRight?: boolean
    layoutWidth?: number
    rightPad?: number
    wordWrap?: boolean
    wrapWidth?: number
    lineHeight?: number
    contentWidth?: number
    fontSize?: number
    breakWords?: boolean
  }
): void {
  const leftPad = options.leftPad ?? ROW_TEXT_HORIZONTAL_PAD
  const rightPad = options.rightPad ?? ROW_TEXT_HORIZONTAL_PAD
  const wordWrap = options.wordWrap ?? false
  const contentWidth = options.contentWidth ?? options.layoutWidth ?? 0
  const displayLabel = wordWrap
    ? label
    : ellipsizeDiagramText(
        label,
        rowLabelMaxTextWidth(contentWidth, leftPad, rightPad)
      )

  const text = createDiagramText({
    text: displayLabel,
    style: {
      fontSize: options.fontSize ?? PROPERTY_ROW_FONT_SIZE,
      fill,
      wordWrap,
      wordWrapWidth: options.wrapWidth,
      lineHeight: options.lineHeight,
      breakWords: options.breakWords,
    },
  })
  text.label = NODE_ROW_TEXT
  text.eventMode = 'none'
  text.y = frame.textY ?? frame.y
  const meta: RowTextMeta = {
    alignRight: options.alignRight,
    leftPad,
    rightPad,
    wordWrap,
    originalLabel: wordWrap ? undefined : label,
  }
  ;(text as DiagramText & { rowMeta?: RowTextMeta }).rowMeta = meta
  if (options.alignRight) {
    text.anchor.set(1, 0)
    text.x = contentWidth - rightPad
  } else {
    text.x = leftPad
  }
  host.addChild(text)
}

/**
 * Paint all body rows into `node-rows` host. Clears previous row widgets.
 * SM ring is nested under the host at the ring frame Y; ring diagram is centered in contentWidth.
 */
export function paintNodeRows(
  hostPixiContainer: Container,
  layout: NodeRowLayout,
  options?: {
    leftPad?: number
    rowFill?: string
    contentWidth?: number
  }
): void {
  const leftPad = options?.leftPad ?? ROW_TEXT_HORIZONTAL_PAD
  const rowFill = options?.rowFill ?? DEFAULT_ROW_FILL
  const contentWidth = Math.max(options?.contentWidth ?? 0, layout.width)
  
  const nodeRowsPixiContainer = ensureNodeRowsPixiContainer(hostPixiContainer)
  destroyChildren(nodeRowsPixiContainer)

  for (const frame of layout.frames) {
    const row = frame.row
    if (row.kind === 'spacer') continue

    if (row.kind === 'sm-ring') {
      const smRingPresentation = row.presentation
      if (!smRingPresentation) continue

      const smRingPixiContainer = new Container()
      smRingPixiContainer.label = NODE_ROW_SM_RING
      smRingPixiContainer.eventMode = 'none'
      smRingPixiContainer.y = frame.y
      setSmRingContainerMeta(smRingPixiContainer, {
        rowHeight: frame.height,
        panelWidth: smRingPresentation.width,
      })

      const smRingBgGraphics = new Graphics()
      smRingBgGraphics.label = NODE_ROW_SM_RING_BG
      smRingBgGraphics.eventMode = 'none'
      paintSmRingBackground(smRingBgGraphics, contentWidth, frame.height)

      const smRingContentPixiContainer = new Container()
      smRingContentPixiContainer.label = NODE_ROW_RING_CONTENT
      smRingContentPixiContainer.eventMode = 'none'
      smRingContentPixiContainer.x = ringContentOffsetX(contentWidth, smRingPresentation.width)
      paintStateMachineRing(smRingContentPixiContainer, smRingPresentation)

      smRingPixiContainer.addChild(smRingBgGraphics, smRingContentPixiContainer)
      nodeRowsPixiContainer.addChild(smRingPixiContainer)
      continue
    }

    if (row.kind === 'note') {
      if (!row.label) continue
      paintTextRow(nodeRowsPixiContainer, frame, row.label, NOTE_ROW_FILL, {
        leftPad: NOTE_FOOTER_PAD_X,
        wordWrap: true,
        wrapWidth: Math.max(40, contentWidth - NOTE_FOOTER_PAD_X * 2),
        lineHeight: NOTE_ROW_FONT_SIZE + 2,
        contentWidth,
        fontSize: NOTE_ROW_FONT_SIZE,
        breakWords: true,
      })
      continue
    }

    if (row.kind === 'multiline') {
      paintTextRow(nodeRowsPixiContainer, frame, row.label, MULTILINE_FILL, {
        leftPad: 5,
        wordWrap: true,
        wrapWidth: Math.max(40, contentWidth - 10),
        lineHeight: SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT,
        contentWidth,
      })
      continue
    }

    if (row.kind === 'output') {
      paintTextRow(nodeRowsPixiContainer, frame, row.label, rowFill, {
        alignRight: true,
        layoutWidth: contentWidth,
        contentWidth,
        rightPad: leftPad,
      })
      continue
    }

    if (row.kind === 'input' || row.kind === 'portal') {
      paintTextRow(nodeRowsPixiContainer, frame, row.label, rowFill, { leftPad, contentWidth })
      continue
    }

    if (row.kind === 'field') {
      paintTextRow(nodeRowsPixiContainer, frame, row.label, rowFill, {
        leftPad,
        contentWidth,
      })
    }
  }
}

/** Remove row host (and legacy labels if present). */
export function clearNodeRowsHost(nodeGroup: Container): void {
  const host = nodeGroup.getChildByLabel(NODE_ROWS_HOST) as Container | null
  if (!host) return
  nodeGroup.removeChild(host)
  try {
    host.destroy({ children: true })
  } catch {
    /* ignore */
  }
}

/**
 * In-place width update for an already-painted body (resize gesture).
 * Moves right-aligned labels, stretches SM-ring bg, centers ring content.
 * Returns false if rows host is missing — caller should `paintNodeRows`.
 */
export function syncNodeRowsToContentWidth(
  hostPixiContainer: Container,
  contentWidth: number
): boolean {
  const nodeRowsPixiContainer = hostPixiContainer.getChildByLabel(NODE_ROWS_HOST)
  if (!nodeRowsPixiContainer) return false

  for (const child of nodeRowsPixiContainer.children) {
    switch (child.label) {
      case NODE_ROW_TEXT:
        if (!isDiagramText(child)) continue
        
        const meta = (child as DiagramText & { rowMeta?: RowTextMeta }).rowMeta
        if (!meta) continue

        const leftPad = meta.leftPad ?? ROW_TEXT_HORIZONTAL_PAD
        const rightPad = meta.rightPad ?? ROW_TEXT_HORIZONTAL_PAD
        if (meta.alignRight) {
          child.x = contentWidth - rightPad
        }
        if (meta.wordWrap) {
          child.style.wordWrapWidth = Math.max(40, contentWidth - 10)
        } else if (meta.originalLabel) {
          child.text = ellipsizeDiagramText(
            meta.originalLabel,
            rowLabelMaxTextWidth(contentWidth, leftPad, rightPad)
          )
        }

        break
      case NODE_ROW_SM_RING:
        const smRingContainerMeta = getSmRingContainerMeta(child)
        
        const smRingBgGraphics = child.getChildByLabel(NODE_ROW_SM_RING_BG)
        if (smRingBgGraphics instanceof Graphics && smRingContainerMeta.rowHeight > 0) {
          paintSmRingBackground(smRingBgGraphics, contentWidth, smRingContainerMeta.rowHeight)
        }

        const smRingContentPixiContainer = child.getChildByLabel(NODE_ROW_RING_CONTENT)
        if (smRingContentPixiContainer && smRingContainerMeta.panelWidth > 0) {
          smRingContentPixiContainer.x = ringContentOffsetX(contentWidth, smRingContainerMeta.panelWidth)
        }
        break
      default:
        break
    }
  }

  return true
}
