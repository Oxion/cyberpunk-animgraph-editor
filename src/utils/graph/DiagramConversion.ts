import { isArrayFieldType } from '../animFieldSchema'
import { NodeDefinitionRegistry, resolveAnimFields } from '../NodeDefinition'
import type { NestedPinSpec } from '../projection'
import { getProjectionDef } from '../projection'
import type { AnimgraphNode } from './animgraphTypes'
import { ANIM_NODE_STATE_TYPE_SET } from './animNodeStateTypes'
import {
  ANIM_NODE_TYPE_STATE
} from './animNodeTypes'
import { isStateMachineNodeType } from './animNodeTypeUtils'
import { getCrossViewConnsForHost, makeCrossViewConnectionPortalPinId } from './crossViewPinIds'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from './diagramConnectionTypes'
import { DiagramNodeDefinitionRegistry } from './DiagramNodeDefinition'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_NODE_TYPE_PORTAL,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from './diagramNodeTypes'
import type { DiagramConnection, RenderData, RenderNode } from './diagramTypes'
import { linkedDataTypeName, resolveLinkedAnimgraphData } from './linkedAnimgraphData'
import {
  appendChild,
  emptyChildSlots,
  getChildSlot,
  removeChild,
} from './nodeChildSlots'
import {
  SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT,
  SM_INPUT_CHAIN_OVERVIEW_BODY_PAD_Y,
} from './NodeChromeMetrics'
import { layoutPortalStateBlocks } from './PortalStateLayout'
import {
  bridgePortalHostId,
  findBridgePortalForWire,
  findDeepPortalForWire,
  invalidateCrossViewPortalPinIndex,
  isDeepPortalNode,
  isPortalHopConnection
} from './portalTopology'
import { syncStatesGroupChildOrder } from './smStateSlot'
import {
  computeStateMachineDetailPanelSize,
  CONDITIONAL_ENTRY_TYPE,
  getStateDisplayName,
  getStateNodesFromSm,
  getStateTransitionEdges,
  layoutStatesOnCircle,
  TRANSITION_DESCRIPTION_TYPE,
} from './StateMachineDetailLayout'

export {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE
} from './diagramNodeTypes'
export {
  PROPERTY_ROW_BODY_TOP,
  PROPERTY_ROW_FONT_SIZE,
  SM_INPUT_CHAIN_OVERVIEW_BODY_HEIGHT,
  SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT,
  SM_INPUT_CHAIN_OVERVIEW_BODY_PAD_Y,
  SM_INPUT_CHAIN_OVERVIEW_WIDTH,
  SM_NODE_HEADER_HEIGHT,
  STATE_OVERVIEW_BODY_HEIGHT,
  STATE_OVERVIEW_WIDTH
} from './NodeChromeMetrics'

export interface DiagramRingChipPresentation {
  stateId: string
  stateIndex: number
  label: string
  x: number
  y: number
  centerX: number
  centerY: number
  hue: number
}

export interface DiagramRingTransitionPresentation {
  fromIndex: number
  toIndex: number
  sourceHue: number
}

export interface StateMachineRingPresentation {
  kind: 'state-machine-ring'
  width: number
  height: number
  radius: number
  centerX: number
  centerY: number
  chipWidth: number
  chipHeight: number
  chips: DiagramRingChipPresentation[]
  transitions: DiagramRingTransitionPresentation[]
}

/**
 * @TODO remove refactor
 * SM overview on the diagram.
 * Section PropertyGroups (states / transitions / …) hang under this node.
 */
export function isStateMachineDiagramRoot(node: RenderNode): boolean {
  return isStateMachineNodeType(node.type)
}

/** Node carrying SM metadata for info-panel ring. */
export function resolveStateMachineInfoNode(
  node: RenderNode | null | undefined,
  allNodes: Map<string, RenderNode>
): RenderNode | null {
  if (!node) return null
  if (Array.isArray(node.metadata?.stateIds)) return node
  if (isStateMachineNodeType(node.type)) return node
  const smId =
    (node.metadata?.stateMachineNodeId as string | undefined) ??
    (node.metadata?.ownerStateMachineId as string | undefined)
  if (smId) {
    const sm = allNodes.get(smId)
    if (sm && isStateMachineNodeType(sm.type)) return sm
  }
  return null
}

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Even N-adic hues on the wheel, rotated by a seed so different SMs differ. */
function harmonicHuesForSlots(count: number, seed: string): number[] {
  if (count <= 0) return []
  const baseHue = hashString(seed) % 360
  if (count === 1) return [baseHue]
  const step = 360 / count
  return Array.from({ length: count }, (_, i) => (baseHue + i * step) % 360)
}

/**
 * Chip fill/stroke for white labels on SM ring panel `#1a1a1a`.
 * Higher S keeps hues clean; mild L dip on yellow avoids mustard without going brown.
 */
export function stateMachineRingChipColors(hue: number): {
  fill: string
  stroke: string
  text: string
} {
  const h = ((hue % 360) + 360) % 360
  const lightness = 42 - 6 * Math.cos(((h - 60) * Math.PI) / 180)
  const fillL = Math.round(lightness)
  const strokeL = Math.round(Math.min(68, lightness + 16))
  return {
    fill: `hsl(${h} 82% ${fillL}%)`,
    stroke: `hsl(${h} 78% ${strokeL}%)`,
    text: '#ffffff',
  }
}

export function isDiagramPortalNode(node: RenderNode): boolean {
  return node.type === DIAGRAM_NODE_TYPE_PORTAL
}

/** Pin-owner bridge portal (sibling of a nested overview host). */
export function isStateEntryPortalNode(node: RenderNode): boolean {
  return (
    node.type === DIAGRAM_NODE_TYPE_PORTAL &&
    (node.id.startsWith('diagram_portal_host_') || node.id.startsWith('diagram_portal_state_'))
  )
}

/**
 * Overview-leaf ancestors of `target` that `from` is outside of (innermost → outermost).
 * Stops ascending once `from` sits under a host — that host is not a cross-view boundary.
 */
export function collectOverviewHostChain(
  target: RenderNode,
  from: RenderNode
): RenderNode[] {
  const hosts: RenderNode[] = []
  let current: RenderNode | null = target
  while (current) {
    if (isDiagramOverviewLeaf(current)) {
      if (isNodeUnderHost(from, current.id)) break
      hosts.push(current)
    }
    current = current.parent ?? null
  }
  return hosts
}

/** Collapsed State leaf on SM / parent views (not StateFrozen). */
export function isStateOverviewLeaf(node: RenderNode): boolean {
  return node.type === ANIM_NODE_TYPE_STATE
}

/** Header + compact body footprint for collapsed State. */
export const STATE_OVERVIEW_BODY_LINE_HEIGHT = SM_INPUT_CHAIN_OVERVIEW_BODY_LINE_HEIGHT
export const STATE_OVERVIEW_BODY_PAD_Y = SM_INPUT_CHAIN_OVERVIEW_BODY_PAD_Y

function readCNameLike(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && '$value' in value) {
    const raw = (value as { $value: unknown }).$value
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return null
}

function readBool01(value: unknown): 0 | 1 {
  if (value === true || value === 1 || value === '1') return 1
  if (value && typeof value === 'object' && '$value' in value) {
    const raw = (value as { $value: unknown }).$value
    if (raw === true || raw === 1 || raw === '1') return 1
  }
  return 0
}

function formatStateTags(tags: unknown): string {
  if (!Array.isArray(tags) || tags.length === 0) return '—'
  const parts = tags
    .map((tag) => readCNameLike(tag))
    .filter((v): v is string => !!v && v !== 'None')
  return parts.length > 0 ? parts.join(', ') : '—'
}

function getStateAnimgraphData(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): Record<string, unknown> | null {
  if (!handlesRegistry) return null
  const handleId = node.data?.originalNodeId ?? node.id
  const data = handlesRegistry.get(handleId)?.Data
  if (!data || typeof data !== 'object') return null
  return data as Record<string, unknown>
}

export function makePortalPinId(portalNodeId: string): string {
  return `portal:${portalNodeId}`
}

export function parsePortalPinId(pinId: string | undefined): string | null {
  if (!pinId || !pinId.startsWith('portal:')) return null
  const id = pinId.slice('portal:'.length)
  return id || null
}

/** Nearest SM diagram root on the parent chain (incl. self). */
export function findStateMachineDiagramRootAncestor(node: RenderNode): RenderNode | null {
  let current: RenderNode | null = node
  while (current) {
    if (isStateMachineDiagramRoot(current)) return current
    current = current.parent ?? null
  }
  return null
}

export interface PortalPinPlacement {
  /** Portal whose id keys the pin. */
  portal: RenderNode
  /** Visible State or SM overview that displays that pin. */
  host: RenderNode
}

function truncateIdLabel(id: string, maxLen: number): string {
  if (!id) return ''
  return id.length > maxLen ? `${id.slice(0, Math.max(1, maxLen - 1))}…` : id
}

/** Short anim type for portal rows (`animAnimNode_Blend2` → `Blend2`). */
function shortAnimNodeType(type: string | undefined): string {
  if (!type) return ''
  return type.replace(/^animAnimNode_/, '').replace(/^anim/, '')
}

export function formatCrossViewEndpointLabel(
  nodeId: string,
  allNodes?: Map<string, RenderNode>,
  handlesRegistry?: Map<string, AnimgraphNode>,
  maxLen = 14
): string {
  if (!nodeId) return '?'
  const node = allNodes?.get(nodeId)
  const handleId = String(node?.data?.originalNodeId ?? nodeId)
  const idLabel = truncateIdLabel(handleId, maxLen) || truncateIdLabel(nodeId, maxLen) || '?'
  if (!handlesRegistry) return idLabel
  const handle = handlesRegistry.get(handleId)
  const typeLabel = shortAnimNodeType(handle?.Data?.$type as string | undefined)
  return typeLabel ? `${typeLabel} ${idLabel}` : idLabel
}

/** Portal / cross-view pin label: source only, e.g. `← Output 37`. */
export function formatCrossViewSourceLabel(
  originalFrom: string,
  handlesRegistry?: Map<string, AnimgraphNode>,
  allNodes?: Map<string, RenderNode>
): string {
  const fromLabel = formatCrossViewEndpointLabel(originalFrom, allNodes, handlesRegistry)
  return `← ${fromLabel}`
}

/** Portal diamond-pin row on SM / State overview (target + pin name). */
export function formatCrossViewPinRowText(
  conn: DiagramConnection,
  handlesRegistry?: Map<string, AnimgraphNode>,
  allNodes?: Map<string, RenderNode>
): string {
  const originalTo = conn.metadata?.originalTo ?? ''
  const pin = conn.pinName ?? ''
  const targetNode = allNodes?.get(originalTo)
  const handleId = String(targetNode?.data?.originalNodeId ?? originalTo)
  const targetLabel = truncateIdLabel(handleId, 16) || truncateIdLabel(originalTo, 16) || '?'
  let typeLabel = ''
  if (handlesRegistry && handleId) {
    const handle = handlesRegistry.get(handleId)
    typeLabel = shortAnimNodeType(handle?.Data?.$type as string | undefined)
  }
  const head = typeLabel ? `${typeLabel} ${targetLabel}` : targetLabel
  return pin ? `${head} · ${pin}` : head
}

function formatOutTransitionIndicesField(value: unknown): string {
  const indices = Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number')
    : []
  if (indices.length === 0) return 'outTransitionIndices: —'
  const maxShow = 10
  const shown = indices.slice(0, maxShow)
  const more = indices.length > maxShow ? '…' : ''
  return `outTransitionIndices: ${shown.join(', ')}${more}`
}

/** State overview rows: portal pin rows, then Data fields (no output socket). */
export function getStateOverviewPropertyRows(
  diagramData: RenderData,
  node: RenderNode,
): DiagramPropertyRow[] {
  const data = getStateAnimgraphData(node, diagramData.handlesRegistry)

  /** @todo its repeating for SM also, needs unification */
  const portalRows: DiagramPropertyRow[] =
    diagramData.connections && diagramData.allNodes
      ? getCrossViewConnsForHost(diagramData, node)
          .map((conn) => {
            return {
              key: 'portal',
              text: formatCrossViewPinRowText(conn, diagramData.handlesRegistry, diagramData.allNodes),
              pinId: makeCrossViewConnectionPortalPinId(conn),
            }
          })
      : []

  if (!data) {
    const count = getChildSlot(node).filter((child) => child.visible !== false).length
    const emptyText =
      count <= 0 ? 'empty' : count === 1 ? '1 child group' : `${count} child groups`
    return [...portalRows, { key: 'body', text: emptyText }]
  }

  const name = readCNameLike(data.name) ?? 'None'
  const prevent = readBool01(data.preventTransitionsInActivationFrame)
  const quality = data.requiredQualityDistanceCategory
  const qualityText =
    typeof quality === 'number' && Number.isFinite(quality) ? String(quality) : String(quality ?? '—')
  const nodesCount = Array.isArray(data.nodes) ? data.nodes.length : 0

  return [
    ...portalRows,
    { key: 'name', text: `name: ${name}` },
    { key: 'outTransitionIndices', text: formatOutTransitionIndicesField(data.outTransitionIndices) },
    { key: 'nodes', text: `nodes: ${nodesCount}` },
    { key: 'preventInAct', text: `preventInAct: ${prevent}` },
    { key: 'qualityDist', text: `qualityDist: ${qualityText}` },
    { key: 'tags', text: `tags: ${formatStateTags(data.tags)}` },
  ]
}

export function getStateOverviewTitleText(node: RenderNode): string {
  const parent = node.parent
  if (parent) {
    const states = getChildSlot(parent).filter((c) => ANIM_NODE_STATE_TYPE_SET.has(c.type))
    const stateIndex = states.findIndex((c) => c.id === node.id)
    if (stateIndex >= 0) return `[${stateIndex}] ${node.id}`
  }
  return node.id
}

/** Collapsed SM input-chain leaf (conditionalEntry / transition chains). */
export function isDiagramTransitionWrapper(node: RenderNode): boolean {
  return node.type === DIAGRAM_TRANSITION_WRAPPER_TYPE
}

export function isDiagramConditionalEntryWrapper(node: RenderNode): boolean {
  return node.type === DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE
}

/** Either SM chain wrapper type (transition / conditionalEntry). */
export function isSmInputChainOverviewLeaf(node: RenderNode): boolean {
  return isDiagramTransitionWrapper(node) || isDiagramConditionalEntryWrapper(node)
}

/** Any diagram leaf that hides children until a scope view opens. */
export function isDiagramOverviewLeaf(node: RenderNode): boolean {
  return DiagramNodeDefinitionRegistry.isOverviewLeaf(node.type)
}

/** Nearest overview leaf (incl. self) that owns this node for portal scope. */
export function getOverviewScopeHost(node: RenderNode): RenderNode | null {
  let current: RenderNode | null = node
  while (current) {
    if (isDiagramOverviewLeaf(current)) return current
    current = current.parent ?? null
  }
  return null
}

export function isNodeUnderHost(node: RenderNode, hostId: string): boolean {
  let current: RenderNode | null = node
  while (current) {
    if (current.id === hostId) return true
    current = current.parent ?? null
  }
  return false
}

/** Property-row DTO used when converting field lists into NodeRows. */
export interface DiagramPropertyRow {
  key: string
  text: string
  pinId?: string
  /** Array input group: header has no pin; slots are `[i]`; append is `[+]`. */
  rowKind?: 'header' | 'slot' | 'append'
}

/** Pin id for "append new array slot" socket (`inputNodes[+]`). */
export function makeAppendPinId(inputName: string): string {
  return `${inputName}[+]`
}

export function isAppendPinId(pinId: string | undefined): boolean {
  return !!pinId && /\[\+\]$/.test(pinId)
}

function hasAnimgraphPresence(value: unknown): 0 | 1 {
  if (value == null) return 0
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('HandleId' in obj || 'HandleRefId' in obj) return 1

    // animFloatLink / animPoseLink / … — shell object is always present; wire lives in `node`.
    if ('node' in obj) {
      return hasAnimgraphPresence(obj.node)
    }
    // Some wrappers store the payload under `value` (often null when unset).
    if ('value' in obj) {
      return hasAnimgraphPresence(obj.value)
    }

    // Non-null object with content counts as present (e.g. nested refs).
    return Object.keys(obj).length > 0 ? 1 : 0
  }
  return 1
}

function getChainRootAnimgraphData(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): Record<string, unknown> | null {
  if (!handlesRegistry) return null
  return resolveLinkedAnimgraphData(node, handlesRegistry)
}

export function isTransitionDescriptionNode(node: RenderNode): boolean {
  return node.type === TRANSITION_DESCRIPTION_TYPE
}

/** Field body shared with DiagramTransitionWrapper (wrapper paints fields only, no sockets). */
export function getTransitionDescriptionPropertyRows(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): DiagramPropertyRow[] {
  const data = getChainRootAnimgraphData(node, handlesRegistry)
  return getTransitionOverviewPropertyRows(data ?? {})
}

export function isConditionalEntryDescriptionNode(node: RenderNode): boolean {
  return node.type === CONDITIONAL_ENTRY_TYPE
}

/** Field body shared with DiagramConditionalEntryWrapper (wrapper paints fields only, no sockets). */
export function getConditionalEntryDescriptionPropertyRows(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): DiagramPropertyRow[] {
  const data = getChainRootAnimgraphData(node, handlesRegistry)
  return getConditionalEntryOverviewPropertyRows(data ?? {})
}

function formatTypedDataFieldValue(value: unknown): string {
  if (value == null) return '—'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') return value || '—'

  if (Array.isArray(value)) {
    return String(value.length)
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('$value' in obj) return readCNameLike(value) ?? 'None'
    if ('HandleId' in obj || 'HandleRefId' in obj) return formatPresence(value)
    if (obj.$type === 'Vector4') {
      return ['X', 'Y', 'Z', 'W']
        .map((axis) => {
          const n = obj[axis]
          return typeof n === 'number' && Number.isFinite(n) ? String(n) : '0'
        })
        .join(', ')
    }
    if (obj.$type === 'Vector3') {
      return ['X', 'Y', 'Z']
        .map((axis) => {
          const n = obj[axis]
          return typeof n === 'number' && Number.isFinite(n) ? String(n) : '0'
        })
        .join(', ')
    }
    // Containers (AdditionalTransform / AdditionalFloatTrack): show entry count.
    if (Array.isArray(obj.entries)) return String(obj.entries.length)
    const nestedName = readCNameLike(obj.name)
    if (nestedName != null) return nestedName
    return formatPresence(value)
  }

  return String(value)
}

export function getTypedDataPropertyRows(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): DiagramPropertyRow[] {
  const data = getChainRootAnimgraphData(node, handlesRegistry)
  if (!data) return []

  const typeName = linkedDataTypeName(data, node.type)
  const inputNameSet = new Set(NodeDefinitionRegistry.getInputFields(typeName))
  const animFields = resolveAnimFields(typeName)

  const rows: DiagramPropertyRow[] = []
  const sameLengthGroups = NodeDefinitionRegistry.getSameLengthGroups(typeName)
  const fieldToGroup = new Map<string, string>()
  for (const [groupId, keys] of sameLengthGroups) {
    for (const key of keys) fieldToGroup.set(key, groupId)
  }
  const emittedGroups = new Set<string>()

  for (const field of animFields) {
    const key = field.key
    const value = data[key]
    const groupId = fieldToGroup.get(key)
    if (groupId) {
      const leader = sameLengthGroups.get(groupId)?.[0]
      if (field.key !== leader) continue
      if (emittedGroups.has(groupId)) continue
      emittedGroups.add(groupId)
      const groupKeys = sameLengthGroups.get(groupId) ?? []
      let n = 0
      for (const groupKey of groupKeys) {
        const raw = data[groupKey]
        if (Array.isArray(raw)) n = Math.max(n, raw.length)
      }
      rows.push({
        key: groupId,
        text: `${groupId}: ${n}`,
      })
      continue
    }

    if (inputNameSet.has(key) && isArrayFieldType(field.type)) {
      const slots = Array.isArray(value) ? value : value != null ? [value] : []
      rows.push({
        key,
        text: `${key}:`,
        rowKind: 'header',
      })
      for (let i = 0; i < slots.length; i++) {
        rows.push({
          key,
          text: `[${i}]`,
          pinId: `${key}[${i}]`,
          rowKind: 'slot',
        })
      }
      rows.push({
        key,
        text: '[+]',
        pinId: makeAppendPinId(key),
        rowKind: 'append',
      })
      continue
    }
    if (inputNameSet.has(key)) {
      rows.push({
        key,
        text: `${key}: ${formatTypedDataFieldValue(value)}`,
        pinId: `${key}[0]`,
      })
      continue
    }

    const nestedPins = nestedExtraPinsUnderField(typeName, key)
    if (nestedPins.length > 0) {
      rows.push({
        key,
        text: `${key}:`,
        rowKind: 'header',
      })
      const handle = handlesRegistry?.get(node.data?.originalNodeId ?? node.id)
      for (const spec of nestedPins) {
        rows.push(...nestedExtraPinPropertyRows(typeName, spec, handle))
      }
      continue
    }

    rows.push({
      key,
      text: `${key}: ${formatTypedDataFieldValue(value)}`,
    })
  }
  return rows
}

function nestedExtraPinsUnderField(typeName: string, fieldKey: string): readonly NestedPinSpec[] {
  return (getProjectionDef(typeName)?.extraPins ?? []).filter((p) => p.path[0] === fieldKey)
}

/** Property rows for an extraPin: intermediate path segments as headers, leaf as pin. */
function nestedExtraPinPropertyRows(
  ownerType: string,
  spec: NestedPinSpec,
  handle: AnimgraphNode | undefined
): DiagramPropertyRow[] {
  const rows: DiagramPropertyRow[] = []
  const path = spec.path
  // path[0] is the top-level field header already emitted by the caller.
  for (let i = 1; i < path.length - 1; i++) {
    const seg = path[i]!
    rows.push({
      key: seg,
      text: `${'  '.repeat(i)}${seg}:`,
      rowKind: 'header',
    })
  }

  const leafDepth = Math.max(1, path.length - 1)
  const leafIndent = '  '.repeat(leafDepth)
  const leafLabel = path[path.length - 1] ?? spec.name

  const handler = NodeDefinitionRegistry.getNodeInputHandler(ownerType, spec.name)
  let count = 1
  let linked: unknown = null
  if (handle) {
    try {
      count = Math.max(handler.count(handle), 1)
      linked = handler.get(handle, 0)
    } catch {
      /* keep defaults */
    }
  }

  if (spec.elementType) {
    rows.push({
      key: spec.name,
      text: `${leafIndent}${leafLabel}:`,
      rowKind: 'header',
    })
    const slotIndent = '  '.repeat(leafDepth + 1)
    for (let i = 0; i < count; i++) {
      rows.push({
        key: spec.name,
        text: `${slotIndent}[${i}]`,
        pinId: `${spec.name}[${i}]`,
        rowKind: 'slot',
      })
    }
    rows.push({
      key: spec.name,
      text: `${slotIndent}[+]`,
      pinId: makeAppendPinId(spec.name),
      rowKind: 'append',
    })
    return rows
  }

  rows.push({
    key: spec.name,
    text: `${leafIndent}${leafLabel}: ${formatPresence(linked)}`,
    pinId: `${spec.name}[0]`,
  })
  return rows
}

export function getTypedDataBodySubtitle(node: RenderNode): string {
  return node.type
    .replace(/^animAnimStateTransitionCondition_/, '')
    .replace(/^animAnimStateTransitionInterpolator_/, '')
    .replace(/^animAnimStateMachine/, '')
}

function formatPresence(value: unknown): string {
  return hasAnimgraphPresence(value) ? 'set' : '—'
}

function getTransitionOverviewPropertyRows(data: Record<string, unknown>): DiagramPropertyRow[] {
  return [
    {
      key: 'animFeatureName',
      text: `animFeature: ${readCNameLike(data.animFeatureName) ?? 'None'}`,
    },
    {
      key: 'canRequestInertialization',
      text: `canRequestInertialization: ${readBool01(data.canRequestInertialization)}`,
    },
    {
      key: 'condition',
      text: `condition: ${formatPresence(data.condition)}`,
      pinId: 'condition[0]',
    },
    {
      key: 'duration',
      text: `duration: ${typeof data.duration === 'number' ? data.duration : (data.duration ?? '—')}`,
    },
    {
      key: 'interpolator',
      text: `interpolator: ${formatPresence(data.interpolator)}`,
      pinId: 'interpolator[0]',
    },
    {
      key: 'isEnabled',
      text: `isEnabled: ${readBool01(data.isEnabled)}`,
    },
    {
      key: 'isForcedToTrue',
      text: `isForcedToTrue: ${readBool01(data.isForcedToTrue)}`,
    },
    {
      key: 'isOutTransitionFromAction',
      text: `isOutTransitionFromAction: ${readBool01(data.isOutTransitionFromAction)}`,
    },
    {
      key: 'priority',
      text: `priority: ${typeof data.priority === 'number' ? data.priority : (data.priority ?? '—')}`,
    },
    {
      key: 'supportBlendFromPose',
      text: `supportBlendFromPose: ${readBool01(data.supportBlendFromPose)}`,
    },
    {
      key: 'targetStateIndex',
      text: `targetStateIndex: ${typeof data.targetStateIndex === 'number'
          ? data.targetStateIndex
          : (data.targetStateIndex ?? '—')
        }`,
    },
  ]
}

function getConditionalEntryOverviewPropertyRows(
  data: Record<string, unknown>
): DiagramPropertyRow[] {
  return [
    {
      key: 'condition',
      text: `condition: ${formatPresence(data.condition)}`,
      pinId: 'condition[0]',
    },
    {
      key: 'isEnabled',
      text: `isEnabled: ${readBool01(data.isEnabled)}`,
    },
    {
      key: 'isForcedToTrue',
      text: `isForcedToTrue: ${readBool01(data.isForcedToTrue)}`,
    },
    {
      key: 'priority',
      text: `priority: ${typeof data.priority === 'number' ? data.priority : (data.priority ?? '—')}`,
    },
    {
      key: 'targetStateIndex',
      text: `targetStateIndex: ${typeof data.targetStateIndex === 'number'
          ? data.targetStateIndex
          : (data.targetStateIndex ?? '—')
        }`,
    },
  ]
}

export function getSmInputChainOverviewTitleText(
  node: RenderNode,
  handlesRegistry?: Map<string, AnimgraphNode>
): string {
  const handleId =
    (node.data?.originalNodeId as string | undefined) ?? node.id
  const data = handlesRegistry?.get(handleId)?.Data as Record<string, unknown> | undefined
  const priority = data?.priority
  if (typeof priority === 'number') {
    return `[p${priority}] ${handleId}`
  }
  return handleId
}

export function getSmInputChainOverviewSubtitle(node: RenderNode): string {
  if (isDiagramTransitionWrapper(node)) return 'transition'
  if (isDiagramConditionalEntryWrapper(node)) return 'conditionalEntry'
  return 'chain'
}

export function buildStateMachineRingPresentation(
  sm: RenderNode,
  renderData: RenderData
): StateMachineRingPresentation {
  const states = getStateNodesFromSm(sm, renderData.allNodes)
  const chipW = 108
  const chipH = 52
  const overviewSize = computeStateMachineDetailPanelSize(states.length, chipW, chipH)
  const centerX = overviewSize.width / 2
  const centerY = overviewSize.height / 2
  const slots = layoutStatesOnCircle(states, centerX, centerY, overviewSize.radius, chipW, chipH)
  const hues = harmonicHuesForSlots(slots.length, sm.id)
  const slotHue = new Map(slots.map((s) => [s.stateIndex, hues[s.stateIndex] ?? 200]))

  const transitions = getStateTransitionEdges(sm, renderData).map((edge) => ({
    fromIndex: edge.fromIndex,
    toIndex: edge.toIndex,
    sourceHue: slotHue.get(edge.fromIndex) ?? 200,
  }))

  return {
    kind: 'state-machine-ring',
    width: overviewSize.width,
    height: overviewSize.height,
    radius: overviewSize.radius,
    centerX,
    centerY,
    chipWidth: chipW,
    chipHeight: chipH,
    chips: slots.map((slot) => ({
      stateId: slot.state.id,
      stateIndex: slot.stateIndex,
      label: getStateDisplayName(slot.state, renderData.handlesRegistry),
      x: slot.x,
      y: slot.y,
      centerX: slot.centerX,
      centerY: slot.centerY,
      hue: slotHue.get(slot.stateIndex) ?? 200,
    })),
    transitions,
  }
}

export function finalizeDiagramConversion(renderData: RenderData): void {
  materializeCrossViewPortals(renderData)
  // Footprints applied by callers via applyDiagramNodeFootprints (avoids import cycle).
}

export type CrossViewPortalChain = {
  deep: RenderNode
  outerHost: RenderNode
  hops: DiagramConnection[]
}

function findExistingDeepPortal(
  renderData: RenderData,
  parent: RenderNode,
  targetId: string,
  fromId: string,
  pinKey: string
): RenderNode | null {
  const found = findDeepPortalForWire(renderData, targetId, fromId, pinKey)
  if (!found || found.parent?.id !== parent.id) return null
  return found
}

/**
 * Build deep (+ optional bridge) portals for a cross-view edge into `target`.
 * `hosts` = {@link collectOverviewHostChain} (innermost first).
 *
 * One portal box per logical wire; each box has a single outbound `input` hop to a non-portal pin.
 * - deep: sibling of target → target pin
 * - bridge: sibling of a nested host → that host's diamond pin
 * - start: materialized source → outerHost
 */
export function ensureCrossViewPortalChain(
  renderData: RenderData,
  target: RenderNode,
  fromId: string,
  pinName: string,
  hosts: RenderNode[],
): CrossViewPortalChain | null {
  if (hosts.length === 0) return null
  const parent = target.parent
  if (!parent) return null

  const pinKey = pinName
  const outerHost = hosts[hosts.length - 1]!
  const hops: DiagramConnection[] = []
  const hopMeta = { originalFrom: fromId, originalTo: target.id }
  const pushHop = (from: string, to: string) => {
    hops.push({
      from,
      to,
      type: DIAGRAM_CONNECTION_TYPE_INPUT,
      pinName: pinName || undefined,
      metadata: hopMeta,
    })
  }

  let deep = findExistingDeepPortal(renderData, parent, target.id, fromId, pinKey)
  if (!deep) {
    const index = getChildSlot(parent).filter(isDeepPortalNode).length
    const portalId = `diagram_portal_in_${target.id}_${index}`
    deep = createDiagramPortalNode({
      id: portalId,
      parent,
    })
    appendChild(parent, deep)
    renderData.allNodes.set(portalId, deep)
    renderData.nodeTypes.add(DIAGRAM_NODE_TYPE_PORTAL)
  }

  pushHop(deep.id, target.id)

  // Bridges for hosts[0..length-2], and for the sole host when length===1.
  const bridgeCount = Math.max(hosts.length - 1, 1)

  for (let i = 0; i < bridgeCount; i++) {
    const host = hosts[i]!
    const parkParent = host.parent
    if (!parkParent) continue

    let bridge = findBridgePortalForWire(
      renderData,
      parkParent,
      host.id,
      fromId,
      target.id,
      pinKey
    )
    if (!bridge) {
      const index = getChildSlot(parkParent).filter(isStateEntryPortalNode).length
      const entryId = isStateOverviewLeaf(host)
        ? `diagram_portal_state_${host.id}_${index}`
        : `diagram_portal_host_${host.id}_${index}`
      bridge = createDiagramPortalNode({
        id: entryId,
        parent: parkParent,
      })
      appendChild(parkParent, bridge)
      renderData.allNodes.set(entryId, bridge)
      renderData.nodeTypes.add(DIAGRAM_NODE_TYPE_PORTAL)
    }

    pushHop(bridge.id, host.id)
  }

  return { deep, outerHost, hops }
}

/**
 * Unified cross-view portal materialize:
 * for each external→nested edge, build the overview-host chain and portal hops,
 * then retarget to the outermost host (`xview:` diamond on that card).
 */
export function materializeCrossViewPortals(renderData: RenderData): void {
  const nextConnections: DiagramConnection[] = []
  const hopKeys = new Set<string>()

  const addHop = (hop: DiagramConnection) => {
    const key = `${hop.from}->${hop.to}:${hop.pinName ?? ''}`
    if (hopKeys.has(key)) return
    hopKeys.add(key)
    nextConnections.push(hop)
  }

  for (const conn of renderData.connections) {
    if (isPortalHopConnection(conn)) {
      addHop(conn)
      continue
    }

    const toNode = renderData.allNodes.get(conn.to)
    const fromNode = renderData.allNodes.get(conn.from)
    if (!toNode || !fromNode) {
      nextConnections.push(conn)
      continue
    }
    if (isDiagramPortalNode(toNode) || isDiagramPortalNode(fromNode)) {
      nextConnections.push(conn)
      continue
    }
    if (conn.metadata?.originalTo) {
      nextConnections.push(conn)
      continue
    }
    if (!fromNode.parent) {
      nextConnections.push(conn)
      continue
    }

    const hosts = collectOverviewHostChain(toNode, fromNode)
    if (hosts.length === 0) {
      nextConnections.push(conn)
      continue
    }

    const chain = ensureCrossViewPortalChain(
      renderData,
      toNode,
      conn.from,
      conn.pinName ?? '',
      hosts,
    )
    if (!chain) {
      nextConnections.push(conn)
      continue
    }

    for (const hop of chain.hops) addHop(hop)

    nextConnections.push({
      ...conn,
      to: chain.outerHost.id,
      metadata: {
        originalFrom: conn.from,
        originalTo: toNode.id,
      },
    })
  }

  renderData.connections = nextConnections
  gcOrphanPortalBoxes(renderData)
  invalidateCrossViewPortalPinIndex(renderData)
}

function gcOrphanPortalBoxes(renderData: RenderData): void {
  const hasOutbound = new Set<string>()
  for (const c of renderData.connections) {
    if (isPortalHopConnection(c)) hasOutbound.add(c.from)
  }
  const toRemove: string[] = []
  renderData.allNodes.forEach((node) => {
    if (!isDiagramPortalNode(node) || hasOutbound.has(node.id)) return
    toRemove.push(node.id)
  })
  for (const id of toRemove) {
    const node = renderData.allNodes.get(id)
    if (!node) continue
    if (node.parent) removeChild(node.parent, node)
    renderData.allNodes.delete(id)
  }
}

/** Debug: dump portal boxes + cross-view edges (from → host + portal hops). */
export function logPortalMaterializeDebug(renderData: RenderData, tag = 'portal-materialize'): void {
  const portals: Array<Record<string, unknown>> = []
  renderData.allNodes.forEach((node) => {
    if (!isDiagramPortalNode(node)) return
    portals.push({
      id: node.id,
      entry: isStateEntryPortalNode(node),
      parent: node.parent?.id ?? null,
      hostId: bridgePortalHostId(node),
    })
  })

  const all = renderData.connections ?? []
  const crossView = all
    .filter((c) => !!c.metadata?.originalTo)
    .map((c) => ({
      from: c.from,
      to: c.to,
      type: c.type,
      pin: c.pinName ?? '',
      originalFrom: c.metadata?.originalFrom ?? '',
      originalTo: c.metadata?.originalTo ?? '',
    }))
  const hops = all
    .filter((c) => isPortalHopConnection(c))
    .map((c) => ({ from: c.from, to: c.to, pin: c.pinName ?? '' }))

  console.groupCollapsed(
    `[${tag}] portals=${portals.length} crossView=${crossView.length} hops=${hops.length} connectionsTotal=${all.length}`
  )
  console.table(portals)
  console.table(crossView)
  console.table(hops)
  console.groupEnd()
}

/**
 * After layout: park each incoming portal to the left of its target (stacked if many).
 * Skips bridge pin-owner hops (those use {@link layoutStatesGroupsWithPortals}).
 */
export function placeIncomingPortalsLeftOfTargets(renderData: RenderData): void {
  const GAP = 28
  const STACK = 8
  const byTarget = new Map<string, RenderNode[]>()

  renderData.allNodes.forEach((node) => {
    if (!isDeepPortalNode(node)) return
    for (const conn of renderData.connections) {
      if (!isPortalHopConnection(conn) || conn.from !== node.id) continue
      const list = byTarget.get(conn.to) ?? []
      list.push(node)
      byTarget.set(conn.to, list)
      break
    }
  })

  byTarget.forEach((portals, targetId) => {
    const target = renderData.allNodes.get(targetId)
    if (!target?.position) return

    const totalH =
      portals.reduce((sum, p) => sum + (p.size?.height ?? 36), 0) +
      Math.max(0, portals.length - 1) * STACK
    let y = target.position.y + ((target.size?.height ?? 80) - totalH) / 2

    portals.forEach((portal) => {
      const w = portal.size?.width ?? 120
      const h = portal.size?.height ?? 36
      const x = target.position.x - w - GAP
      portal.position = { x, y }
      portal.bounds = { x, y, width: w, height: h }
      y += h + STACK
    })
  })
}

function isStatesPropertyGroup(node: RenderNode | null | undefined): node is RenderNode {
  return (
    !!node &&
    (node.metadata?.smDiagramRole === 'states' || node.metadata?.propertyName === 'states')
  )
}

/** `states` PropertyGroup whose parent is an SM diagram root. */
export function isSmStatesPropertyGroup(node: RenderNode | null | undefined): node is RenderNode {
  return (
    isStatesPropertyGroup(node) &&
    !!node.parent &&
    isStateMachineDiagramRoot(node.parent)
  )
}

/** Group + SM parent + direct children (states / portals) for layout history. */
export function collectSmStatesGroupLayoutNodes(group: RenderNode): RenderNode[] {
  const nodes: RenderNode[] = [group]
  if (group.parent) nodes.push(group.parent)
  for (const child of getChildSlot(group)) {
    nodes.push(child)
  }
  return nodes
}

function createDiagramPortalNode(options: {
  id: string
  parent: RenderNode
  width?: number
  height?: number
}): RenderNode {
  const w = options.width ?? 120
  const h = options.height ?? 36
  return {
    id: options.id,
    type: DIAGRAM_NODE_TYPE_PORTAL,
    data: {},
    position: { x: 0, y: 0 },
    size: { width: w, height: h },
    childSlots: emptyChildSlots(),
    parent: options.parent,
    metadata: {},
    bounds: { x: 0, y: 0, width: w, height: h },
    isContainer: false,
    isGroup: false,
    zIndex: 2,
    backgroundColor: '#2a3344',
    borderColor: '#7eb6e8',
    borderWidth: 1,
    borderRadius: 6,
    color: '#d7e8f8',
    visible: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
  }
}

/**
 * ELK per (portals + State), column stack, then size the `states` PropertyGroup from bbox.
 * State order follows SM.Data.states (not metadata).
 */
export async function layoutStatesGroupWithPortals(
  renderData: RenderData,
  group: RenderNode
): Promise<string[]> {
  const sm = group.parent
  const smHandle = sm
    ? renderData.handlesRegistry.get(String(sm.data?.originalNodeId ?? sm.id))
    : undefined
  const states = syncStatesGroupChildOrder(group, smHandle)
  if (states.length === 0) return []

  const groupKids = getChildSlot(group)
  const entryPortals = groupKids.filter(isStateEntryPortalNode)
  const portalsByState = new Map<string, RenderNode[]>()
  for (const portal of entryPortals) {
    const stateId = bridgePortalHostId(portal)
    if (!stateId) continue
    const list = portalsByState.get(stateId) ?? []
    list.push(portal)
    portalsByState.set(stateId, list)
  }

  const groupPadding = (group as { padding?: { top?: number }; spacing?: number }).padding
  const padding = groupPadding?.top ?? 10
  const columnGap = (group as { spacing?: number }).spacing ?? 16

  const result = await layoutPortalStateBlocks({
    stateBlocks: states.map((state) => ({
      state: {
        id: state.id,
        width: state.size?.width ?? 240,
        height: state.size?.height ?? 80,
      },
      portals: (portalsByState.get(state.id) ?? []).map((portal) => ({
        id: portal.id,
        width: portal.size?.width ?? 120,
        height: portal.size?.height ?? 36,
      })),
    })),
    columnGap,
    padding,
  })

  const dirtyIds: string[] = [group.id]
  // Title row above content (PropertyGroup chrome).
  const titleHeight = 40
  for (const [id, pos] of result.positions) {
    const node = renderData.allNodes.get(id)
    if (!node) continue
    const x = pos.x
    const y = pos.y + titleHeight
    node.position = { x, y }
    const w = node.size?.width ?? 120
    const h = node.size?.height ?? 36
    node.bounds = { x, y, width: w, height: h }
    dirtyIds.push(id)
  }

  group.size = {
    width: result.groupSize.width,
    height: result.groupSize.height + titleHeight,
  }
  group.bounds = {
    x: group.position?.x ?? 0,
    y: group.position?.y ?? 0,
    width: group.size.width,
    height: group.size.height,
  }
  if (sm) dirtyIds.push(sm.id)
  return dirtyIds
}

export async function layoutStatesGroupsWithPortals(renderData: RenderData): Promise<void> {
  const groups: RenderNode[] = []
  renderData.allNodes.forEach((node) => {
    if (isStatesPropertyGroup(node)) groups.push(node)
  })
  for (const group of groups) {
    await layoutStatesGroupWithPortals(renderData, group)
  }
}
