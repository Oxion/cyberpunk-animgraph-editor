import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { mutateHandleData } from './animgraphMutation'
import { mutationCtxFromRenderData } from './diagramMutationCtx'
import { NodeDefinitionRegistry } from '../NodeDefinition'
import { createBlankInputArraySlot } from './pinArrayTemplates'
import {
  isDiagramOverviewLeaf,
  isDiagramPortalNode,
  isStateMachineDiagramRoot,
  isStateOverviewLeaf,
  SM_NODE_HEADER_HEIGHT,
} from './DiagramConversion'
import { isDiagramFrameNode } from './diagramFrameNodes'
import { isVirtualOverviewPinId } from './crossViewPinIds'
import { getInputPinColor, resolvePinColorFromType } from './pinTyping'
import { layoutNodeBody, nodeUsesRowComposition, pinsFromRowLayout } from './NodeRowModel'
import { getWorldPosition } from './DiagramGeometry'

export type PinSide = 'in' | 'out'

export type NodePinShape = 'circle' | 'diamond'

export interface NodePinDesc {
  /** Stable id, e.g. `condition[0]` or `output` */
  pinId: string
  side: PinSide
  label: string
  /** Row Y in node-local space. X is derived: `pinLocalX(side, nodeWidth)`. */
  localY: number
  /** When true, chrome already names the property — skip pin label text. */
  hideLabel?: boolean
  /** Visual socket form. Portal pins use diamond to stand apart from circles. */
  shape?: NodePinShape
  /** Socket fill from pinTyping type→color (hex). */
  pinColor?: string
}

/** Left edge for inputs, right edge for outputs. */
export function pinLocalX(side: PinSide, nodeWidth: number): number {
  return side === 'out' ? nodeWidth : 0
}

export const PIN_RADIUS = 5
export const PIN_HIT_PADDING = 4
const PIN_HEADER_Y = SM_NODE_HEADER_HEIGHT
const PIN_TOP_PAD = 10
const PIN_SPACING = 16

export function nodeSupportsPins(node: RenderNode): boolean {
  if (!node || node.visible === false) return false
  if (isDiagramFrameNode(node) || node.isGroup || node.type === 'PropertyGroup') return false
  // State / SM overview cards: portal rows (+ body fields); SM still has out.
  if (isStateOverviewLeaf(node) || isStateMachineDiagramRoot(node)) return true
  if (isDiagramOverviewLeaf(node) || isDiagramPortalNode(node)) {
    return false
  }
  return true
}

export function parsePinName(
  pinName: string | undefined
): { inputName: string; index: number; append: boolean } | null {
  if (!pinName) return null
  const match = pinName.match(/^([^[\]]+)(?:\[(\d+|\+)\])?$/)
  if (!match) return null
  if (match[2] === '+') {
    return { inputName: match[1]!, index: -1, append: true }
  }
  return {
    inputName: match[1]!,
    index: match[2] !== undefined ? Number.parseInt(match[2], 10) : 0,
    append: false,
  }
}

function getHandleForNode(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): AnimgraphNode | undefined {
  if (!handlesRegistry) return undefined
  const id = node.data?.originalNodeId ?? node.id
  return handlesRegistry.get(id)
}

/** Input slot count to expose as pins (existing slots only). */
function getInputSlotCount(
  inputName: string,
  nodeType: string,
  handle: AnimgraphNode | undefined
): number {
  if (!handle) return 1
  const type = handle.Data?.$type ?? nodeType
  const handler = NodeDefinitionRegistry.getNodeInputHandler(type, inputName)
  try {
    // At least one pin so empty inputs stay wireable; handler.count drives real slots
    // (critical for MathExpression* where sockets live under expressionData).
    return Math.max(handler.count(handle), 1)
  } catch {
    const value = handle.Data?.[inputName]
    if (Array.isArray(value)) return Math.max(value.length, 1)
    return 1
  }
}

function pinRowLocalY(rowIndex: number, height: number): number {
  return Math.min(
    height - PIN_RADIUS - 4,
    PIN_HEADER_Y + PIN_TOP_PAD + rowIndex * PIN_SPACING
  )
}

/**
 * Blender-like socket stack for ordinary diagram nodes:
 * outputs on top (right), then inputs below (left).
 */
function buildStackedInputPins(
  node: RenderNode,
  size: { width: number; height: number },
  diagramData: RenderData,
): NodePinDesc[] {
  const height = Math.max(size.height, PIN_HEADER_Y + 20)
  const handle = getHandleForNode(node, diagramData.handlesRegistry)
  const pins: NodePinDesc[] = []
  let rowIndex = 0

  pins.push({
    pinId: 'output',
    side: 'out',
    label: 'out',
    localY: pinRowLocalY(rowIndex, height),
    pinColor: resolvePinColorFromType(node.type) ?? undefined,
  })
  rowIndex += 1

  const inputNames = NodeDefinitionRegistry.getInputFields(node.type)
  for (const inputName of inputNames) {
    const slots = getInputSlotCount(inputName, node.type, handle)
    for (let i = 0; i < slots; i++) {
      const pinId = `${inputName}[${i}]`
      const label = slots > 1 ? `${inputName}[${i}]` : inputName
      pins.push({
        pinId,
        side: 'in',
        label,
        localY: pinRowLocalY(rowIndex, height),
        pinColor: getInputPinColor(node.type, pinId) ?? undefined,
      })
      rowIndex += 1
    }
  }

  return pins
}

function buildPropertyRowPins(
  node: RenderNode,
  size: { width: number; height: number },
  diagramData: RenderData,
): NodePinDesc[] {
  const layout = layoutNodeBody(node, diagramData)
  return pinsFromRowLayout(layout, size.width)
}

/**
 * Build local-space pins for a diagram node.
 * Row-composition nodes: pins from layout frames.
 * Default nodes: Blender stack (outputs top-right, inputs below-left).
 */
export function buildNodePins(
  node: RenderNode,
  size: { width: number; height: number },
  diagramData: RenderData,
): NodePinDesc[] {
  if (!nodeSupportsPins(node)) return []
  if (nodeUsesRowComposition(node)) {
    return buildPropertyRowPins(node, size, diagramData)
  }
  return buildStackedInputPins(node, size, diagramData)
}

export type InputPinOption = {
  pinId: string
  label: string
  pinColor?: string
}

/** Projection input pins for a to-node (no outputs / portal sockets). */
export function listInputPinOptions(
  node: RenderNode,
  diagramData: RenderData,
): InputPinOption[] {
  const size = node.size ?? { width: 120, height: 80 }
  return buildNodePins(node, size, diagramData)
    .filter((p) => p.side === 'in' && !isVirtualOverviewPinId(p.pinId))
    .map((p) => ({
      pinId: p.pinId,
      label: p.label,
      pinColor: p.pinColor,
    }))
}

export function findPin(
  pins: NodePinDesc[],
  pinId: string,
  side?: PinSide
): NodePinDesc | undefined {
  return pins.find((p) => p.pinId === pinId && (side === undefined || p.side === side))
}

export function findOutputPin(pins: NodePinDesc[]): NodePinDesc | undefined {
  return pins.find((p) => p.side === 'out')
}

export function findInputPin(pins: NodePinDesc[], pinName?: string): NodePinDesc | undefined {
  if (!pinName) return pins.find((p) => p.side === 'in')
  const exact = findPin(pins, pinName, 'in')
  if (exact) return exact
  const parsed = parsePinName(pinName)
  if (parsed) {
    const indexed = findPin(pins, `${parsed.inputName}[${parsed.index}]`, 'in')
    if (indexed) return indexed
    // Fall back to first pin of the same input group (better than AABB mid-edge).
    return pins.find(
      (p) =>
        p.side === 'in' &&
        p.pinId.startsWith(`${parsed.inputName}[`) &&
        !p.pinId.endsWith('[+]')
    )
  }
  return pins.find((p) => p.side === 'in' && p.pinId.startsWith(pinName))
}

export function pinLocalToWorld(
  node: RenderNode,
  pin: NodePinDesc,
  nodeWidth?: number
): { x: number; y: number } | null {
  const world = getWorldPosition(node)
  if (!world) return null
  const width = nodeWidth ?? node.size?.width ?? 120
  return { x: world.x + pinLocalX(pin.side, width), y: world.y + pin.localY }
}

export function getInputSlotMeta(
  toNode: RenderNode,
  pinName: string,
  handlesRegistry: Map<string, AnimgraphNode>
): {
  handle: AnimgraphNode
  inputName: string
  index: number
} | null {
  const parsed = parsePinName(pinName)
  if (!parsed || parsed.append) return null
  const originalId = toNode.data?.originalNodeId ?? toNode.id
  const handle = handlesRegistry.get(originalId)
  if (!handle) return null
  if (!NodeDefinitionRegistry.getInputFields(handle.Data?.$type ?? toNode.type).includes(parsed.inputName)) return null
  return { handle, inputName: parsed.inputName, index: parsed.index }
}

export { createBlankInputArraySlot } from './pinArrayTemplates'

/**
 * Append a blank slot to an array input. Prefer passing RenderData so mutation facade runs.
 */
export function appendInputArraySlot(
  handle: AnimgraphNode,
  inputName: string,
  nodeType: string,
  renderData?: RenderData
): number | null {
  if (!renderData) return null
  let newIndex: number | null = null
  mutateHandleData(
    mutationCtxFromRenderData(renderData),
    handle.HandleId,
    [inputName],
    (data) => {
    if (!Array.isArray(data[inputName])) data[inputName] = []
    const arr = data[inputName] as unknown[]
      arr.push(createBlankInputArraySlot(handle, inputName, nodeType))
      newIndex = arr.length - 1
    }
  )
  return newIndex
}

