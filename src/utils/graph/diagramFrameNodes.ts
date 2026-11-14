/**
 * User Group / Note — diagram-only frames (not animgraph handles).
 */

import type { RenderNode } from './diagramTypes'
import { DIAGRAM_NODE_TYPE_GROUP, DIAGRAM_NODE_TYPE_NOTE } from './diagramNodeTypes'
import { DiagramNodeDefinitionRegistry } from './DiagramNodeDefinition'
import { DEFAULT_CHILD_SLOT, getChildSlot } from './nodeChildSlots'
import {
  PROPERTY_GROUP_INNER_PADDING,
  PROPERTY_GROUP_OUTER_PADDING,
  SM_NODE_HEADER_HEIGHT,
} from './NodeChromeMetrics'
import {
  applyResizeStartLayout,
  captureResizeStartLayout,
  compensateChildrenForParentOriginShift,
  computeParentFitDelta,
  isResizeLayoutDeltaZero,
  MIN_NODE_HEIGHT,
  MIN_NODE_WIDTH,
} from './resizeCascade'

export const DIAGRAM_FRAME_DEFAULT_WIDTH = 320
export const DIAGRAM_FRAME_DEFAULT_HEIGHT = 200
export const NOTE_FOOTER_MIN_HEIGHT = 52
export const NOTE_FOOTER_PAD_X = 10
export const NOTE_FOOTER_PAD_Y = 8
export const NOTE_FOOTER_LINE_HEIGHT = 14
export const DIAGRAM_FRAME_CHILD_PAD = {
  top: SM_NODE_HEADER_HEIGHT + PROPERTY_GROUP_INNER_PADDING,
  right: PROPERTY_GROUP_OUTER_PADDING,
  bottom: PROPERTY_GROUP_INNER_PADDING,
  left: PROPERTY_GROUP_OUTER_PADDING,
}

export function isDiagramGroupNode(node: RenderNode | null | undefined): boolean {
  return node?.type === DIAGRAM_NODE_TYPE_GROUP
}

export function isDiagramNoteNode(node: RenderNode | null | undefined): boolean {
  return node?.type === DIAGRAM_NODE_TYPE_NOTE
}

export function isDiagramFrameNode(node: RenderNode | null | undefined): boolean {
  if (!node) return false
  const type = node.type
  if (DiagramNodeDefinitionRegistry.isOverviewLeaf(type)) return false
  if (DiagramNodeDefinitionRegistry.isWrapperType(type)) return false
  return DiagramNodeDefinitionRegistry.isUnrestrictedContainer(type)
}

export function readDiagramGroupLabel(node: RenderNode): string {
  const raw = node.metadata?.label
  return typeof raw === 'string' ? raw : ''
}

export function readDiagramNoteText(node: RenderNode): string {
  const raw = node.metadata?.text
  return typeof raw === 'string' ? raw : ''
}

export function noteBodyTextTopY(node: RenderNode): number {
  const pad = DIAGRAM_FRAME_CHILD_PAD
  let top = pad.top
  for (const child of getChildSlot(node, DEFAULT_CHILD_SLOT)) {
    if (child.visible === false) continue
    const y = child.position?.y ?? 0
    const h = child.size?.height ?? 80
    top = Math.max(top, y + h + pad.bottom)
  }
  return top
}

export function noteFooterHeight(node: RenderNode, nodeWidth: number): number {
  const text = readDiagramNoteText(node).trim()
  if (!text) return NOTE_FOOTER_MIN_HEIGHT
  const innerW = Math.max(40, nodeWidth - NOTE_FOOTER_PAD_X * 2)
  const approxChars = Math.max(8, Math.floor(innerW / 6.5))
  const lines = text.split('\n').reduce((sum, line) => {
    return sum + Math.max(1, Math.ceil(line.length / approxChars))
  }, 0)
  return Math.max(
    NOTE_FOOTER_MIN_HEIGHT,
    NOTE_FOOTER_PAD_Y * 2 + lines * NOTE_FOOTER_LINE_HEIGHT
  )
}

/** @returns layout-affected ids (frame + compensated children) for renderer sync. */
export function fitDiagramFrameToChildren(frame: RenderNode): string[] {
  const kids = getChildSlot(frame, DEFAULT_CHILD_SLOT)
  const pad = DIAGRAM_FRAME_CHILD_PAD
  const footer = pad.bottom

  if (kids.length === 0) {
    const w = Math.max(frame.size?.width ?? 0, DIAGRAM_FRAME_DEFAULT_WIDTH)
    const h = Math.max(
      frame.size?.height ?? 0,
      DIAGRAM_FRAME_DEFAULT_HEIGHT,
      pad.top + footer
    )
    const sizeChanged =
      (frame.size?.width ?? 0) !== w || (frame.size?.height ?? 0) !== h
    frame.size = { width: w, height: h }
    frame.bounds = {
      x: frame.position.x,
      y: frame.position.y,
      width: w,
      height: h,
    }
    return sizeChanged ? [frame.id] : []
  }

  const parentStart = captureResizeStartLayout(frame)
  // Floor at default size so empty-ish frames do not shrink below template.
  const fitStart = {
    ...parentStart,
    width: Math.max(parentStart.width, DIAGRAM_FRAME_DEFAULT_WIDTH),
    height: Math.max(parentStart.height, DIAGRAM_FRAME_DEFAULT_HEIGHT),
  }
  const childLayouts = kids
    .filter((child) => child.visible !== false)
    .map((c) => {
      const layout = captureResizeStartLayout(c)
      return {
        ...layout,
        width: layout.width + pad.right,
        height: layout.height + footer,
      }
    })
  const delta = computeParentFitDelta(fitStart, childLayouts, {
    left: pad.left,
    top: pad.top,
  })
  if (isResizeLayoutDeltaZero(delta)) {
    if (
      fitStart.width !== parentStart.width ||
      fitStart.height !== parentStart.height
    ) {
      applyResizeStartLayout(frame, fitStart)
      return [frame.id]
    }
    return []
  }

  applyResizeStartLayout(frame, {
    x: fitStart.x + delta.dx,
    y: fitStart.y + delta.dy,
    width: Math.max(MIN_NODE_WIDTH, fitStart.width + delta.dw),
    height: Math.max(MIN_NODE_HEIGHT, fitStart.height + delta.dh),
  })
  const affected = [frame.id]
  if (delta.dx !== 0 || delta.dy !== 0) {
    affected.push(
      ...compensateChildrenForParentOriginShift(frame, delta.dx, delta.dy)
    )
  }
  return affected
}

export function ensureNoteFitsFooter(node: RenderNode): void {
  if (!isDiagramNoteNode(node)) return
  const w = Math.max(node.size?.width ?? DIAGRAM_FRAME_DEFAULT_WIDTH, 80)
  const minH = SM_NODE_HEADER_HEIGHT + noteFooterHeight(node, w)
  const h = Math.max(node.size?.height ?? 0, minH)
  node.size = { width: w, height: h }
  node.bounds = {
    x: node.position.x,
    y: node.position.y,
    width: w,
    height: h,
  }
}
