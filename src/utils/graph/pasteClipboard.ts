import type { AnimgraphNode, AnimgraphObject } from './animgraphTypes'
import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import type { HandleMutationSnapshot } from './addNodePlan'
import {
  isDiagramPortalNode,
  isStateMachineDiagramRoot,
} from './DiagramConversion'
import { isPropertyGroupNode } from './diagramAddPolicy'
import { isPortalHopConnection } from './portalTopology'
import {
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
} from './diagramNodeTypes'
import { fitDiagramFrameToChildren, isDiagramFrameNode } from './diagramFrameNodes'
import { getWorldBounds, getWorldPosition } from './DiagramGeometry'
import { addFloatingHandle, isFloatingHandle } from './floatingHandles'
import {
  captureAddedNodePlacement,
  type AddedNodePlacement,
} from './GraphHistory'
import { fitPropertyGroupToChildren } from './nodeAddBootstrap'
import {
  attachNewHandleToSlot,
  makeAnimgraphAddTarget,
  type AnimgraphAttachContext,
} from './nodeAddRules'
import { appendChild, DEFAULT_CHILD_SLOT, emptyChildSlots, walkSubtree } from './nodeChildSlots'
import { applyNodeFootprint } from './nodeFootprint'
import { getSmPropertyGroup } from './StateMachineDetailLayout'
import {
  syncStatesGroupChildOrder,
} from './smStateSlot'
import { isStateMachineNodeType } from './animNodeTypeUtils'

export type ClipboardHandleAttach =
  | { kind: 'floating' }
  | {
      kind: 'slot'
      parentSourceHandleId: string
      slotName: string
    }

/** Diagram chrome copied 1:1 from source (createMinimalRenderNode defaults are wrong for PG/frame). */
export type ClipboardDiagramFields = Pick<
  RenderNode,
  | 'isContainer'
  | 'isGroup'
  | 'groupType'
  | 'layout'
  | 'spacing'
  | 'padding'
  | 'zIndex'
  | 'color'
  | 'backgroundColor'
  | 'borderColor'
  | 'borderWidth'
  | 'borderRadius'
  | 'visible'
  | 'opacity'
  | 'scale'
  | 'rotation'
  | 'description'
>

export type NodeClipboardItem = {
  sourceId: string
  /** Parent in source graph; null when node has no parent. */
  sourceParentId: string | null
  /** childSlots key on sourceParentId. */
  parentSlot: string
  diagramNodeType: string
  animgraphNodeType?: string
  handleAttach?: ClipboardHandleAttach
  diagramFields: ClipboardDiagramFields
  /** Position relative to source parent (local coords). */
  localX: number
  localY: number
  worldX: number
  worldY: number
  width: number
  height: number
  metadata?: Record<string, unknown>
  data?: Record<string, unknown>
  dataOverlay: AnimgraphObject | null
}
export type NodeClipboardConnection = {
  from: string
  to: string
  pinName?: string
}

export type NodeClipboard = {
  items: NodeClipboardItem[]
  connections: NodeClipboardConnection[]
}

function isHandleRef(value: unknown): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'HandleRefId' in (value as object) &&
      !('Data' in (value as object))
  )
}

function stripLinkRefs(value: unknown): void {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const item = value[i]
      if (isHandleRef(item)) value.splice(i, 1)
      else stripLinkRefs(item)
    }
    return
  }
  const obj = value as Record<string, unknown>
  for (const key of Object.keys(obj)) {
    const nested = obj[key]
    if (isHandleRef(nested)) delete obj[key]
    else stripLinkRefs(nested)
  }
}

export function cloneAnimgraphDataWithoutLinkRefs(
  data: AnimgraphObject
): AnimgraphObject {
  const clone = structuredClone(data) as AnimgraphObject
  stripLinkRefs(clone)
  return clone
}

function logicalConnectionEnds(conn: DiagramConnection): {
  from: string
  to: string
  pinName?: string
} {
  return {
    from: conn.metadata?.originalFrom ?? conn.from,
    to: conn.metadata?.originalTo ?? conn.to,
    pinName: conn.pinName,
  }
}

function isCopyableConnection(conn: DiagramConnection): boolean {
  if (isPortalHopConnection(conn)) return false
  return true
}

/** Topmost selected nodes — ancestors in selection are excluded. */
export function collectSelectionRoots(
  renderData: RenderData,
  selectedIds: readonly string[]
): RenderNode[] {
  const selected = new Set<string>()
  for (const id of selectedIds) {
    if (renderData.allNodes.has(id)) selected.add(id)
  }
  const roots: RenderNode[] = []
  for (const id of selectedIds) {
    const node = renderData.allNodes.get(id)
    if (!node || !selected.has(id)) continue
    let parent = node.parent
    let nestedUnderSelection = false
    while (parent) {
      if (selected.has(parent.id)) {
        nestedUnderSelection = true
        break
      }
      parent = parent.parent
    }
    if (!nestedUnderSelection) roots.push(node)
  }
  return roots
}

/** All non-portal nodes under selection roots (deduped). */
export function collectClipboardSubtreeNodes(
  renderData: RenderData,
  selectedIds: readonly string[]
): RenderNode[] {
  const roots = collectSelectionRoots(renderData, selectedIds)
  const seen = new Set<string>()
  const nodes: RenderNode[] = []
  for (const root of roots) {
    walkSubtree(root, (node) => {
      if (isDiagramPortalNode(node)) return
      if (seen.has(node.id)) return
      seen.add(node.id)
      nodes.push(node)
    })
  }
  return nodes
}

function handleRefId(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null
  if ('HandleRefId' in entry && entry.HandleRefId) return String(entry.HandleRefId)
  if ('HandleId' in entry && entry.HandleId) return String(entry.HandleId)
  return null
}

function snapshotDiagramFields(node: RenderNode): ClipboardDiagramFields {
  return {
    isContainer: node.isContainer,
    isGroup: node.isGroup,
    groupType: node.groupType,
    layout: node.layout,
    spacing: node.spacing,
    padding: node.padding ? structuredClone(node.padding) : undefined,
    zIndex: node.zIndex,
    color: node.color,
    backgroundColor: node.backgroundColor,
    borderColor: node.borderColor,
    borderWidth: node.borderWidth,
    borderRadius: node.borderRadius,
    visible: node.visible,
    opacity: node.opacity,
    scale: node.scale,
    rotation: node.rotation,
    description: node.description,
  }
}

const SM_METADATA_ID_KEYS = ['ownerStateMachineId', 'stateMachineNodeId'] as const

/** Remap pasted metadata ids; drop stale SM refs so parent-walk resolves the pasted SM. */
export function remapClipboardMetadataIds(
  metadata: Record<string, unknown>,
  id: string,
  item: NodeClipboardItem,
  idMap: ReadonlyMap<string, string>
): Record<string, unknown> {
  const meta = structuredClone(metadata)
  for (const key of SM_METADATA_ID_KEYS) {
    const v = meta[key]
    if (typeof v !== 'string') continue
    if (idMap.has(v)) {
      meta[key] = idMap.get(v)!
    } else if (key === 'ownerStateMachineId') {
      delete meta[key]
    }
  }
  if (Array.isArray(meta.stateIds)) {
    meta.stateIds = meta.stateIds.map((entry) =>
      typeof entry === 'string' && idMap.has(entry) ? idMap.get(entry)! : entry
    )
  }
  delete meta.smStateBundleIds
  delete meta.smPropertyChildCounts
  if (isStateMachineNodeType(item.diagramNodeType)) {
    meta.stateMachineNodeId = id
    meta.ownerStateMachineId = id
  }
  return meta
}

/** Restore diagram node from clipboard snapshot (new id, remapped originalNodeId). */
export function restoreDiagramNodeFromClipboard(
  item: NodeClipboardItem,
  id: string,
  localPosition: { x: number; y: number },
  idMap: ReadonlyMap<string, string>
): RenderNode {
  const pos = localPosition
  const w = item.width
  const h = item.height
  const fields = item.diagramFields
  const metadata = item.metadata
    ? remapClipboardMetadataIds(item.metadata, id, item, idMap)
    : isStateMachineNodeType(item.diagramNodeType)
      ? { stateMachineNodeId: id, ownerStateMachineId: id }
      : {}
  return {
    id,
    type: item.diagramNodeType,
    data: {
      ...(item.data ? structuredClone(item.data) : {}),
      originalNodeId: id,
    },
    position: { ...pos },
    size: { width: w, height: h },
    childSlots: emptyChildSlots(),
    metadata,
    bounds: { x: pos.x, y: pos.y, width: w, height: h },
    ...structuredClone(fields),
  }
}

/** Refresh SM.stateIds + state ownerStateMachineId from live SM.Data.states after paste. */
export function syncPastedSmStateMetadata(
  diagramData: RenderData,
  smDiagramNode: RenderNode
): void {
  if (!isStateMachineDiagramRoot(smDiagramNode) && !isStateMachineNodeType(smDiagramNode.type)) return
  const group = getSmPropertyGroup(smDiagramNode, 'states', diagramData.allNodes)
  if (!group) return
  const smHandle = diagramData.handlesRegistry.get(String(smDiagramNode.data?.originalNodeId ?? smDiagramNode.id))
  if (!smHandle) return

  const ordered = syncStatesGroupChildOrder(group, smHandle)
  smDiagramNode.metadata = {
    ...smDiagramNode.metadata,
    stateMachineNodeId: smDiagramNode.id,
    ownerStateMachineId: smDiagramNode.id,
    stateIds: ordered.map((box) => box.id),
  }
}

/** Re-sync every pasted SM root after a clipboard paste completes. */
export function syncPastedSmStateMetadataForNodes(
  renderData: RenderData,
  nodes: readonly RenderNode[]
): void {
  for (const node of nodes) {
    if (isStateMachineDiagramRoot(node) || isStateMachineNodeType(node.type)) {
      syncPastedSmStateMetadata(renderData, node)
    }
  }
}

function snapshotSlotBefore(attach: AnimgraphAttachContext): unknown {
  const slotName = attach.slot.name
  const current = attach.parentHandle.Data?.[slotName]
  return current === undefined ? undefined : structuredClone(current)
}

export type ApplyPasteClipboardResult =
  | {
      ok: true
      primaryNode: RenderNode
      placements: AddedNodePlacement[]
      handle?: HandleMutationSnapshot
      parentRefreshIds: string[]
      allAddedIds: string[]
      label: string
    }
  | { ok: false; message: string }

/** Paste handles are disconnected until wired — never seed nodesToInit. */
const PASTE_INIT_IN_ANIMGRAPH = false

function registerPastedHandle(
  renderData: RenderData,
  input: {
    id: string
    animgraphNodeType: string
    data: AnimgraphObject
    rootAnimgraphAttach?: AnimgraphAttachContext
    item: NodeClipboardItem
    idMap: ReadonlyMap<string, string>
  }
): { ok: true; handle: HandleMutationSnapshot } | { ok: false; message: string } {
  const { id, animgraphNodeType, data, rootAnimgraphAttach, item, idMap } = input
  const nodesToInitLen = renderData.originalAnimgraph?.nodesToInit.length ?? 0

  if (rootAnimgraphAttach) {
    if (!renderData.originalAnimgraph) {
      return { ok: false, message: 'No original animgraph; cannot attach handle' }
    }
    const beforeSlot = snapshotSlotBefore(rootAnimgraphAttach)
    const attachResult = attachNewHandleToSlot(
      {
        handlesRegistry: renderData.handlesRegistry,
        allNodes: renderData.allNodes,
        originalAnimgraph: renderData.originalAnimgraph,
      },
      id,
      animgraphNodeType,
      rootAnimgraphAttach,
      data,
      { initInAnimgraph: PASTE_INIT_IN_ANIMGRAPH }
    )
    if (!attachResult.ok) return attachResult
    return {
      ok: true,
      handle: {
        kind: 'slot',
        handleId: id,
        animgraphNodeType,
        attach: rootAnimgraphAttach,
        beforeSlot,
        nodesToInitLen,
        bootstrapHandles: [],
      },
    }
  }

  if (item.handleAttach?.kind === 'slot') {
    if (!renderData.originalAnimgraph) {
      return { ok: false, message: 'No original animgraph; cannot attach handle' }
    }
    const parentHandleId =
      idMap.get(item.handleAttach.parentSourceHandleId) ??
      item.handleAttach.parentSourceHandleId
    const parentHandle = renderData.handlesRegistry.get(String(parentHandleId))
    if (!parentHandle) {
      return {
        ok: false,
        message: `Parent handle '${parentHandleId}' missing for paste`,
      }
    }
    const attach = makeAnimgraphAddTarget(parentHandle, item.handleAttach.slotName)
    if (!attach) {
      return {
        ok: false,
        message: `Slot '${item.handleAttach.slotName}' not found on parent handle`,
      }
    }
    const beforeSlot = snapshotSlotBefore(attach)
    const attachResult = attachNewHandleToSlot(
      {
        handlesRegistry: renderData.handlesRegistry,
        allNodes: renderData.allNodes,
        originalAnimgraph: renderData.originalAnimgraph,
      },
      id,
      animgraphNodeType,
      attach,
      data,
      { initInAnimgraph: PASTE_INIT_IN_ANIMGRAPH }
    )
    if (!attachResult.ok) return attachResult
    return {
      ok: true,
      handle: {
        kind: 'slot',
        handleId: id,
        animgraphNodeType,
        attach,
        beforeSlot,
        nodesToInitLen,
        bootstrapHandles: [],
      },
    }
  }

  const floating: AnimgraphNode = { HandleId: id, Data: data }
  addFloatingHandle(renderData, floating)
  return {
    ok: true,
    handle: {
      kind: 'floating',
      handleId: id,
      animgraphNodeType,
      data,
      nodesToInitLen,
      bootstrapHandles: [],
    },
  }
}

/** Restore one clipboard node (internal subtree or gate-approved root). */
export function applyPasteClipboardNode(
  diagramData: RenderData,
  input: {
    id: string
    item: NodeClipboardItem
    diagramParent: RenderNode
    parentSlot: string
    localPosition: { x: number; y: number }
    idMap: ReadonlyMap<string, string>
    /** Root paste only — slot attach from canAddNode gate. */
    rootAnimgraphAttach?: AnimgraphAttachContext
  }
): ApplyPasteClipboardResult {
  const { id, item, diagramParent, parentSlot, localPosition, idMap, rootAnimgraphAttach } =
    input
  if (diagramData.allNodes.has(id) || diagramData.handlesRegistry.has(id)) {
    return { ok: false, message: `Id '${id}' already exists` }
  }

  const node = restoreDiagramNodeFromClipboard(item, id, localPosition, idMap)

  let handle: HandleMutationSnapshot | undefined
  const animgraphNodeType =
    item.animgraphNodeType ??
    (typeof item.dataOverlay?.$type === 'string' ? item.dataOverlay.$type : undefined)

  if (item.dataOverlay && animgraphNodeType) {
    const data = structuredClone(item.dataOverlay) as AnimgraphObject
    data.$type = animgraphNodeType
    const registered = registerPastedHandle(diagramData, {
      id,
      animgraphNodeType,
      data,
      rootAnimgraphAttach,
      item,
      idMap,
    })
    if (!registered.ok) return registered
    handle = registered.handle
  }

  appendChild(diagramParent, node, parentSlot)
  diagramData.allNodes.set(node.id, node)
  diagramData.nodeTypes.add(node.type)

  if (isPropertyGroupNode(diagramParent)) {
    fitPropertyGroupToChildren(diagramParent)
  } else if (isDiagramFrameNode(diagramParent)) {
    fitDiagramFrameToChildren(diagramParent)
  }

  applyNodeFootprint(node, diagramData)

  const placement = captureAddedNodePlacement(diagramData, node, diagramParent)
  return {
    ok: true,
    primaryNode: node,
    placements: [placement],
    handle,
    parentRefreshIds: [diagramParent.id],
    allAddedIds: [node.id],
    label: `Paste ${item.diagramNodeType}`,
  }
}

/** How the handle was registered in the source graph (for internal subtree paste). */
export function resolveClipboardHandleAttach(
  renderData: RenderData,
  handleId: string
): ClipboardHandleAttach | undefined {
  if (!renderData.handlesRegistry.has(handleId)) return undefined
  if (isFloatingHandle(renderData, handleId)) {
    return { kind: 'floating' }
  }
  for (const [parentId, parentHandle] of renderData.handlesRegistry) {
    const data = parentHandle.Data
    if (!data) continue
    for (const slotName of Object.keys(data)) {
      if (slotName === '$type') continue
      const slotValue = data[slotName]
      if (Array.isArray(slotValue)) {
        for (const entry of slotValue) {
          if (handleRefId(entry) === handleId) {
            return {
              kind: 'slot',
              parentSourceHandleId: parentId,
              slotName,
            }
          }
        }
      } else if (handleRefId(slotValue) === handleId) {
        return {
          kind: 'slot',
          parentSourceHandleId: parentId,
          slotName,
        }
      }
    }
  }
  return { kind: 'floating' }
}

function snapshotNodeToClipboardItem(
  renderData: RenderData,
  node: RenderNode
): NodeClipboardItem {
  const bounds = getWorldBounds(node)
  const width = bounds?.width || node.size?.width || 240
  const height = bounds?.height || node.size?.height || 80
  const handleId = String(node.data?.originalNodeId ?? node.id)
  const handle = renderData.handlesRegistry.get(handleId)
  const animgraphNodeType =
    typeof handle?.Data?.$type === 'string' ? handle.Data.$type : undefined
  return {
    sourceId: node.id,
    sourceParentId: node.parent?.id ?? null,
    parentSlot: node.parentSlot ?? DEFAULT_CHILD_SLOT,
    diagramNodeType: node.type || '',
    animgraphNodeType,
    handleAttach: handle ? resolveClipboardHandleAttach(renderData, handleId) : undefined,
    diagramFields: snapshotDiagramFields(node),
    localX: node.position?.x ?? 0,
    localY: node.position?.y ?? 0,
    worldX: bounds?.x ?? node.position?.x ?? 0,
    worldY: bounds?.y ?? node.position?.y ?? 0,
    width,
    height,
    metadata: node.metadata ? structuredClone(node.metadata) : undefined,
    data: node.data ? structuredClone(node.data) : undefined,
    dataOverlay: handle?.Data
      ? cloneAnimgraphDataWithoutLinkRefs(handle.Data as AnimgraphObject)
      : null,
  }
}

/** Parent-before-child order for hierarchical paste. */
export function orderClipboardItemsForPaste(
  items: readonly NodeClipboardItem[]
): NodeClipboardItem[] {
  const byId = new Map(items.map((item) => [item.sourceId, item]))
  const ordered: NodeClipboardItem[] = []
  const visited = new Set<string>()

  const visit = (item: NodeClipboardItem) => {
    if (visited.has(item.sourceId)) return
    const parentId = item.sourceParentId
    if (parentId && byId.has(parentId)) {
      visit(byId.get(parentId)!)
    }
    visited.add(item.sourceId)
    ordered.push(item)
  }

  for (const item of items) visit(item)
  return ordered
}

export function isClipboardSubtreeRoot(
  item: NodeClipboardItem,
  copiedSourceIds: ReadonlySet<string>
): boolean {
  return !item.sourceParentId || !copiedSourceIds.has(item.sourceParentId)
}

export function snapshotNodesForClipboard(
  renderData: RenderData,
  selectedIds: readonly string[]
): NodeClipboard | null {
  const nodes = collectClipboardSubtreeNodes(renderData, selectedIds)
  if (nodes.length === 0) return null

  const items = nodes.map((node) => snapshotNodeToClipboardItem(renderData, node))
  const copied = new Set(items.map((item) => item.sourceId))

  const connections: NodeClipboardConnection[] = []
  for (const conn of renderData.connections) {
    if (!isCopyableConnection(conn)) continue
    const ends = logicalConnectionEnds(conn)
    if (!copied.has(ends.from) || !copied.has(ends.to)) continue
    connections.push({
      from: ends.from,
      to: ends.to,
      ...(ends.pinName ? { pinName: ends.pinName } : {}),
    })
  }

  return { items, connections }
}

export function remapClipboardConnections(
  connections: readonly NodeClipboardConnection[],
  idMap: ReadonlyMap<string, string>
): NodeClipboardConnection[] {
  const out: NodeClipboardConnection[] = []
  for (const conn of connections) {
    const from = idMap.get(conn.from)
    const to = idMap.get(conn.to)
    if (!from || !to || from === to) continue
    out.push({
      from,
      to,
      ...(conn.pinName ? { pinName: conn.pinName } : {}),
    })
  }
  return out
}

export function computePasteAnchorWorld(
  viewportCenter: { x: number; y: number },
  parentNode: RenderNode,
  parentInView: boolean
): { x: number; y: number } {
  if (parentInView) return { ...viewportCenter }
  const parentBounds = getWorldBounds(parentNode)
  if (!parentBounds) return { ...viewportCenter }
  return {
    x: parentBounds.x + parentBounds.width / 2,
    y: parentBounds.y + parentBounds.height / 2,
  }
}

/** Map clipboard root item to local position under paste parent, preserving offsets from anchor root. */
export function clipboardItemLocalPosition(
  item: NodeClipboardItem,
  anchorRoot: NodeClipboardItem,
  anchorWorld: { x: number; y: number },
  parentNode: RenderNode
): { x: number; y: number } | null {
  const parentWorld = getWorldPosition(parentNode)
  if (!parentWorld) return null

  const rootCenterX = anchorRoot.worldX + anchorRoot.width / 2
  const rootCenterY = anchorRoot.worldY + anchorRoot.height / 2
  const itemCenterX = item.worldX + item.width / 2
  const itemCenterY = item.worldY + item.height / 2

  const targetCenterX = anchorWorld.x + (itemCenterX - rootCenterX)
  const targetCenterY = anchorWorld.y + (itemCenterY - rootCenterY)

  const w = item.width
  const h = item.height
  return {
    x: targetCenterX - w / 2 - parentWorld.x,
    y: targetCenterY - h / 2 - parentWorld.y,
  }
}

export function resolvePasteParentNode(
  renderData: RenderData,
  item: NodeClipboardItem,
  pasteTarget: RenderNode,
  idMap: ReadonlyMap<string, string>,
  copiedSourceIds: ReadonlySet<string>
): RenderNode | null {
  if (item.sourceParentId && copiedSourceIds.has(item.sourceParentId)) {
    const mappedId = idMap.get(item.sourceParentId)
    if (mappedId) {
      const mapped = renderData.allNodes.get(mappedId)
      if (mapped) return mapped
    }
    return null
  }
  return pasteTarget
}

/** Child whose parent is also in the clipboard — restore, do not re-gate add rules. */
export function isClipboardInternalItem(
  item: NodeClipboardItem,
  copiedSourceIds: ReadonlySet<string>
): boolean {
  return !!item.sourceParentId && copiedSourceIds.has(item.sourceParentId)
}

/** Resolve contain-field name from clipboard PG item (mirrors getPropertyGroupSlotName fallbacks). */
export function clipboardPropertyGroupSlotName(
  item: NodeClipboardItem
): string | undefined {
  if (item.diagramNodeType !== DIAGRAM_NODE_TYPE_PROPERTY_GROUP) return undefined
  const fromMeta = item.metadata?.propertyName
  if (typeof fromMeta === 'string' && fromMeta.length > 0) return fromMeta
  const fromGroupName = item.metadata?.groupName
  if (typeof fromGroupName === 'string' && fromGroupName.length > 0) {
    return fromGroupName
  }
  const fromData = item.data?.childrenPropertyName
  if (typeof fromData === 'string' && fromData.length > 0) return fromData
  const fromId = item.sourceId.match(/_group_([^/]+)$/)
  if (fromId?.[1]) return fromId[1]
  return undefined
}

/** Contain-field name for PropertyGroup paste gate (canAddNode preferred slot). */
export function resolvePastePreferredSlotName(
  item: NodeClipboardItem
): string | undefined {
  return clipboardPropertyGroupSlotName(item)
}

export function resolvePasteItemLocalPosition(
  item: NodeClipboardItem,
  anchorRoot: NodeClipboardItem,
  anchorWorld: { x: number; y: number },
  pasteParent: RenderNode,
  copiedSourceIds: ReadonlySet<string>
): { x: number; y: number } | null {
  if (item.sourceParentId && copiedSourceIds.has(item.sourceParentId)) {
    return { x: item.localX, y: item.localY }
  }
  return clipboardItemLocalPosition(item, anchorRoot, anchorWorld, pasteParent)
}
