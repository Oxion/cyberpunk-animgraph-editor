/**
 * Diagram placement helpers for add-node (PropertyGroup append/layout, sizes, ids).
 * requireTypes expansion lives in addNodeActions (compileAttachWithRequiredChildren).
 */

import type { AnimgraphNodeLike } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { getPropertyGroupSlotName, isPropertyGroupNode } from './diagramAddPolicy'
import {
  PROPERTY_GROUP_INNER_PADDING,
  PROPERTY_GROUP_OUTER_PADDING,
  SM_NODE_HEADER_HEIGHT,
} from './NodeChromeMetrics'
import { resolveNodeFootprint } from './nodeFootprint'
import type { NodeAddRulesContext } from './nodeAddRules'
import {
  DEFAULT_CHILD_SLOT,
  appendChild,
  emptyChildSlots,
  getChildSlot,
} from './nodeChildSlots'

export type BootstrapAttachCtx = NodeAddRulesContext & {
  originalAnimgraph: { nodesToInit: AnimgraphNodeLike[] }
}

const DEFAULT_GROUP_PADDING = { top: 10, right: 10, bottom: 10, left: 10 }
const DEFAULT_GROUP_SPACING = 16

/** Next free numeric HandleId / diagram id across registry and allNodes. */
export function allocateNextNumericId(
  ctx: NodeAddRulesContext,
  reserved: ReadonlySet<string> = new Set()
): string {
  let max = -1
  const consider = (raw: string) => {
    if (!/^\d+$/.test(raw)) return
    max = Math.max(max, Number(raw))
  }
  for (const id of ctx.handlesRegistry.keys()) consider(String(id))
  if (ctx.allNodes) {
    for (const id of ctx.allNodes.keys()) consider(String(id))
  }
  for (const id of reserved) consider(String(id))
  let next = max + 1
  while (reserved.has(String(next))) next += 1
  return String(next)
}

export function collectOccupiedNodeIds(
  ctx: NodeAddRulesContext,
  reserved: ReadonlySet<string> = new Set()
): Set<string> {
  const occupied = new Set<string>()
  for (const id of ctx.handlesRegistry.keys()) occupied.add(String(id))
  if (ctx.allNodes) {
    for (const id of ctx.allNodes.keys()) occupied.add(id)
  }
  for (const id of reserved) occupied.add(id)
  return occupied
}

/** Short type used as auto-id stem (`animAnimNode_Blend2` → `Blend2`). */
export function shortNodeTypeForId(type: string): string {
  const short = type
    .replace(/^animAnimStateTransitionCondition_/, '')
    .replace(/^animAnimStateTransitionInterpolator_/, '')
    .replace(/^animAnimNodeSourceChannel_/, '')
    .replace(/^animAnimNode_/, '')
    .replace(/^anim/, '')
  const cleaned = short.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned || 'node'
}

/** First free id for a type: `Blend2`, then `Blend2_2`, `Blend2_3`, … */
export function suggestIdFromNodeType(
  type: string,
  occupied: ReadonlySet<string>
): string {
  const base = shortNodeTypeForId(type)
  if (!occupied.has(base)) return base
  let n = 2
  while (occupied.has(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}

export function createMinimalRenderNode(options: {
  id: string
  type: string
  size: { width: number; height: number }
  position?: { x: number; y: number }
  metadata?: Record<string, unknown>
  data?: Record<string, unknown>
  isContainer?: boolean
}): RenderNode {
  const pos = options.position ?? { x: 0, y: 0 }
  const { width, height } = options.size
  return {
    id: options.id,
    type: options.type,
    data: options.data ?? { originalNodeId: options.id },
    position: { ...pos },
    size: { width, height },
    childSlots: emptyChildSlots(),
    metadata: { ...(options.metadata ?? {}) },
    bounds: { x: pos.x, y: pos.y, width, height },
    isContainer: options.isContainer ?? false,
    isGroup: false,
    zIndex: 0,
    color: '#ff6b6b',
    backgroundColor: '#ffe0e0',
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 4,
    visible: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
    description: '',
  }
}

export function createPropertyGroupNode(
  ownerId: string,
  slotName: string,
  childNodes: RenderNode[],
  allNodes: Map<string, RenderNode>
): RenderNode {
  const groupNode: RenderNode = {
    id: `node_${ownerId}_group_${slotName}`,
    type: 'PropertyGroup',
    data: {},
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    childSlots: emptyChildSlots(),
    metadata: {
      propertyName: slotName,
    },
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    isContainer: true,
    isGroup: true,
    groupType: 'property',
    layout: 'vertical',
    spacing: DEFAULT_GROUP_SPACING,
    padding: { ...DEFAULT_GROUP_PADDING },
    zIndex: 1,
    color: '#666',
    backgroundColor: '#f0f0f0',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 6,
    visible: true,
    opacity: 0.9,
    scale: 1,
    rotation: 0,
  }

  allNodes.set(groupNode.id, groupNode)
  for (const child of childNodes) {
    appendChild(groupNode, child, DEFAULT_CHILD_SLOT)
  }

  layoutPropertyGroupChildren(groupNode)
  return groupNode
}

function groupPadding(pg: RenderNode): {
  top: number
  right: number
  bottom: number
  left: number
} {
  return pg.padding ?? DEFAULT_GROUP_PADDING
}

function groupSpacing(pg: RenderNode): number {
  return typeof pg.spacing === 'number' ? pg.spacing : DEFAULT_GROUP_SPACING
}

/** Local origin for stacked children — below PropertyGroup title chrome when applicable. */
export function propertyGroupContentOrigin(pg: RenderNode): { x: number; y: number } {
  const padding = groupPadding(pg)
  if (pg.isGroup || pg.type === 'PropertyGroup') {
    return {
      x: PROPERTY_GROUP_OUTER_PADDING + PROPERTY_GROUP_INNER_PADDING,
      y: SM_NODE_HEADER_HEIGHT + PROPERTY_GROUP_INNER_PADDING,
    }
  }
  return { x: padding.left, y: padding.top }
}

/** Stack children vertically (local coords) and size the PropertyGroup to fit. */
export function layoutPropertyGroupChildren(pg: RenderNode): void {
  const padding = groupPadding(pg)
  const spacing = groupSpacing(pg)
  const origin = propertyGroupContentOrigin(pg)
  const children = getChildSlot(pg, DEFAULT_CHILD_SLOT)
  let y = origin.y
  let maxW = 0
  for (const child of children) {
    const w = child.size?.width ?? 240
    const h = child.size?.height ?? 80
    child.position = { x: origin.x, y }
    child.bounds = { x: child.position.x, y: child.position.y, width: w, height: h }
    maxW = Math.max(maxW, w)
    y += h + spacing
  }
  if (children.length > 0) y -= spacing
  pg.size = {
    width: Math.max(maxW + origin.x + padding.right, 100),
    height: Math.max(y + padding.bottom, origin.y + padding.bottom),
  }
  pg.bounds = {
    x: pg.position.x,
    y: pg.position.y,
    width: pg.size.width,
    height: pg.size.height,
  }
}

/**
 * Append `child` at the end of a PropertyGroup without moving existing siblings
 * (portals / custom layouts in `states` must stay put).
 * When `grow` is false, only links the child (and optional bottom position); PG size stays.
 */
export function appendChildToPropertyGroup(
  pg: RenderNode,
  child: RenderNode,
  options: { grow?: boolean } = {}
): void {
  const grow = options.grow !== false
  const padding = groupPadding(pg)
  const spacing = groupSpacing(pg)
  const origin = propertyGroupContentOrigin(pg)
  const w = child.size?.width ?? 240
  const h = child.size?.height ?? 80
  const siblings = getChildSlot(pg, DEFAULT_CHILD_SLOT)

  let y = origin.y
  for (const sibling of siblings) {
    const sy = sibling.position?.y ?? 0
    const sh = sibling.size?.height ?? 0
    y = Math.max(y, sy + sh + spacing)
  }
  if (siblings.length === 0) y = origin.y

  // Match horizontal alignment of existing same-type siblings (ELK / portal layout).
  const peer = siblings.find((c) => c.type === child.type)
  const x = peer?.position?.x ?? origin.x

  child.position = { x, y }
  child.bounds = { x: child.position.x, y: child.position.y, width: w, height: h }
  appendChild(pg, child, DEFAULT_CHILD_SLOT)

  if (grow) {
    const maxX = Math.max(
      pg.size?.width ?? 0,
      padding.left + w + padding.right,
      ...getChildSlot(pg, DEFAULT_CHILD_SLOT).map(
        (c) => (c.position?.x ?? 0) + (c.size?.width ?? 0) + padding.right
      )
    )
    const maxY = Math.max(
      pg.size?.height ?? 0,
      ...getChildSlot(pg, DEFAULT_CHILD_SLOT).map(
        (c) => (c.position?.y ?? 0) + (c.size?.height ?? 0) + padding.bottom
      )
    )
    pg.size = { width: maxX, height: maxY }
    pg.bounds = {
      x: pg.position.x,
      y: pg.position.y,
      width: pg.size.width,
      height: pg.size.height,
    }
  }
}

/** Grow PropertyGroup bbox to fit current children (does not move children). */
export function fitPropertyGroupToChildren(pg: RenderNode): void {
  const padding = groupPadding(pg)
  const children = getChildSlot(pg, DEFAULT_CHILD_SLOT)
  if (children.length === 0) return

  const maxX = Math.max(
    pg.size?.width ?? 0,
    ...children.map((c) => (c.position?.x ?? 0) + (c.size?.width ?? 0) + padding.right)
  )
  const maxY = Math.max(
    pg.size?.height ?? 0,
    ...children.map((c) => (c.position?.y ?? 0) + (c.size?.height ?? 0) + padding.bottom)
  )
  pg.size = { width: maxX, height: maxY }
  pg.bounds = {
    x: pg.position.x,
    y: pg.position.y,
    width: pg.size.width,
    height: pg.size.height,
  }
}

export function findPropertyGroup(
  owner: RenderNode,
  slotName: string
): RenderNode | undefined {
  return getChildSlot(owner, DEFAULT_CHILD_SLOT).find(
    (c) => isPropertyGroupNode(c) && getPropertyGroupSlotName(c) === slotName
  )
}

export function ensurePropertyGroup(
  owner: RenderNode,
  slotName: string,
  allNodes: Map<string, RenderNode>,
  seedChildren: RenderNode[] = []
): { group: RenderNode; created: boolean } {
  const existing = findPropertyGroup(owner, slotName)
  if (existing) {
    for (const child of seedChildren) {
      appendChildToPropertyGroup(existing, child)
    }
    return { group: existing, created: false }
  }

  const group = createPropertyGroupNode(owner.id, slotName, seedChildren, allNodes)
  // Nested under overview: local origin under header-ish padding.
  group.position = { x: 10, y: 40 }
  group.bounds = {
    x: group.position.x,
    y: group.position.y,
    width: group.size.width,
    height: group.size.height,
  }
  appendChild(owner, group, DEFAULT_CHILD_SLOT)
  return { group, created: true }
}

export function computeSizeForNewNodeType(
  diagramData: RenderData,
  draft: RenderNode,
): { width: number; height: number } {
  return resolveNodeFootprint(diagramData, draft)
}
