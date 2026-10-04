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

export function fitDiagramFrameToChildren(frame: RenderNode): void {
  const kids = getChildSlot(frame, DEFAULT_CHILD_SLOT)
  const pad = DIAGRAM_FRAME_CHILD_PAD
  const footer = pad.bottom
  let maxX = DIAGRAM_FRAME_DEFAULT_WIDTH
  let maxY = DIAGRAM_FRAME_DEFAULT_HEIGHT
  for (const child of kids) {
    if (child.visible === false) continue
    const w = child.size?.width ?? 120
    const h = child.size?.height ?? 80
    const x = child.position?.x ?? 0
    const y = child.position?.y ?? 0
    maxX = Math.max(maxX, x + w + pad.right)
    maxY = Math.max(maxY, y + h + footer)
  }
  if (kids.length === 0) {
    maxY = Math.max(maxY, pad.top + footer)
  }
  frame.size = { width: maxX, height: maxY }
  frame.bounds = {
    x: frame.position.x,
    y: frame.position.y,
    width: maxX,
    height: maxY,
  }
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
