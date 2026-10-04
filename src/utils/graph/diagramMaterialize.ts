/**
 * Diagram materializer: walk animgraph Data from rootNode using projection roles.
 * Registry is a HandleId → Data dictionary. Diagram nodes are RenderNodes
 * (handle boxes, PropertyGroups, later Note/Group/wrapper) — not handles.
 *
 * contain — PropertyGroup of owned handles / inline values; pin-DAG of those
 *           members is nested into the same group
 * wrap — facade around handle or inline box; a later pass nests pin-DAG into any parent
 * pin — wire to an already placed box
 * embed / hide — consume handles (and their contain/embed/hide subtree) without a box
 * inline — box without HandleId; owner box.data.inlines[field] points at its id
 *
 * Pin-DAG parenting: contain-compatible boxes (AnimNodes) go to the LCA
 * contain PG that accepts `$type`. Pin-overridden `ref` slots (WeightedQuat, …)
 * stay beside their consumer even when there is no LCA.
 */

import type { AnimgraphData, AnimgraphNode, AnimgraphNodeLike, AnimgraphObject } from './animgraphTypes'
import type { DiagramConnection, RenderNode } from './diagramTypes'
import { fieldTypeName, getAnimTypeFields, isAnimType, isLinkFieldType, structWrefNodeTarget } from '../animTypes'
import type { AnimFieldDef, AnimFieldType } from '../animTypes'
import { NodeDefinitionRegistry } from '../NodeDefinition'
import { isAnimgraphLinkObject, isAnimgraphNodeLikeObject } from '../extractors/NodeReferenceUtils'
import {
  getFieldRole,
  getProjectedContainFieldNames,
  getProjectedFieldNames,
  getProjectionDef,
  getProjectedWrap,
  inferFieldRole,
  isProjectedEmbedded,
} from '../projection'
import { DIAGRAM_NODE_TYPE_PROPERTY_GROUP } from './DiagramNodeDefinition'
import { DIAGRAM_CONNECTION_TYPE_INPUT } from './diagramConnectionTypes'
import { isSmInputChainOverviewLeaf } from './DiagramConversion'
import {
  appendChild,
  DEFAULT_CHILD_SLOT,
  emptyChildSlots,
  getChildSlot,
  removeChild,
} from './nodeChildSlots'

/** Empty-link sentinels in CR2W; Root is still a real handle with id "0". */
const INVALID_HANDLE_IDS = new Set(['-1', '0'])

function isRegisteredOrNonSentinelId(
  id: string,
  registry: Map<string, AnimgraphNode>
): boolean {
  return !INVALID_HANDLE_IDS.has(id) || registry.has(id)
}

export type DiagramMaterializeResult = {
  rootNodes: RenderNode[]
  allNodes: Map<string, RenderNode>
  connections: DiagramConnection[]
  nodeTypes: Set<string>
  floatingHandleIds: Set<string>
}

export function resolveHandleId(
  value: unknown,
  registry: Map<string, AnimgraphNode>
): string | null {
  if (!value) return null

  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  const unwrapped =
    record && typeof record.$type === 'string' && 'node' in record ? record.node : value

  if (!unwrapped || typeof unwrapped !== 'object') {
    if (typeof unwrapped === 'string' && isRegisteredOrNonSentinelId(unwrapped, registry)) {
      return unwrapped
    }
    return null
  }

  const ref = unwrapped as AnimgraphNodeLike & { HandleRefId?: string; HandleId?: string }

  if (ref.HandleRefId && isRegisteredOrNonSentinelId(ref.HandleRefId, registry)) {
    const referenced = registry.get(ref.HandleRefId)
    if (referenced) return referenced.HandleId
  }

  if (ref.HandleId && isRegisteredOrNonSentinelId(ref.HandleId, registry)) {
    return ref.HandleId
  }

  return null
}

/** Scalar or each array element — not flattened to HandleIds. */
export function fieldItems(fieldData: unknown): unknown[] {
  if (fieldData == null || fieldData === '') return []
  return Array.isArray(fieldData) ? fieldData : [fieldData]
}

export function extractHandleIdsFromField(
  fieldData: unknown,
  registry: Map<string, AnimgraphNode>
): string[] {
  const ids: string[] = []
  for (const item of fieldItems(fieldData)) {
    const id = resolveHandleId(item, registry)
    if (id) ids.push(id)
  }
  return ids
}

export function isHandleBox(node: RenderNode): boolean {
  return typeof node.data?.originalNodeId === 'string'
}

export function isInlineBox(node: RenderNode): boolean {
  return node.metadata?.inline === true
}

export function handleIdOfBox(node: RenderNode): string | null {
  const id = node.data?.originalNodeId
  return typeof id === 'string' ? id : null
}

export function snapshotPropertyGroups(parent: RenderNode): Map<string, RenderNode[]> {
  const sections = new Map<string, RenderNode[]>()
  for (const child of getChildSlot(parent)) {
    if (child.type !== DIAGRAM_NODE_TYPE_PROPERTY_GROUP && !child.isGroup) continue
    const name = String(child.metadata?.propertyName ?? '')
    if (!name) continue
    sections.set(name, [...getChildSlot(child)])
  }
  return sections
}

function pinInputValues(node: AnimgraphNode): unknown[] {
  const values: unknown[] = []
  const typeName = node.Data.$type
  for (const inputName of NodeDefinitionRegistry.getInputFields(typeName)) {
    const inputHandler = NodeDefinitionRegistry.getNodeInputHandler(typeName, inputName)
    const count = inputHandler.count(node)
    for (let i = 0; i < count; i++) {
      const value = inputHandler.get(node, i)
      if (value) values.push(value)
    }
  }
  return values
}

function asAnimgraphData(payload: Record<string, unknown> & { $type: string }): AnimgraphObject {
  return payload as AnimgraphObject
}

function wrapPriority(data: Record<string, unknown>): number {
  return typeof data.priority === 'number' ? data.priority : 0
}

function nodeColor(nodeType: string): string {
  const colors: Record<string, string> = {
    animAnimNode_StateMachine: '#ff6b6b',
    animAnimNode_Blend2: '#4ecdc4',
    animAnimNode_BlendMultiple: '#45b7d1',
    animAnimNode_Switch: '#96ceb4',
    animAnimNode_SkAnim: '#feca57',
    animAnimNode_FloatInput: '#ff9ff3',
    animAnimNode_IntInput: '#54a0ff',
    animAnimNode_MathExpressionFloat: '#5f27cd',
  }
  return colors[nodeType] || '#95a5a6'
}

function nodeBackgroundColor(nodeType: string): string {
  const colors: Record<string, string> = {
    animAnimNode_StateMachine: '#ffe0e0',
    animAnimNode_Blend2: '#e0f7f7',
    animAnimNode_BlendMultiple: '#e0f2ff',
    animAnimNode_Switch: '#e8f5e8',
    animAnimNode_SkAnim: '#fff8e0',
    animAnimNode_FloatInput: '#ffe0f7',
    animAnimNode_IntInput: '#e0f0ff',
    animAnimNode_MathExpressionFloat: '#f0e8ff',
  }
  return colors[nodeType] || '#f8f9fa'
}

function typeDependentChrome(typeName: string): Partial<RenderNode> {
  switch (typeName) {
    case 'animAnimNode_StateMachine':
      return {
        borderColor: '#c88',
        borderWidth: 2,
        borderRadius: 8,
      }
    case 'animAnimNode_State':
      return {
        borderColor: '#5fa8d3',
        borderWidth: 2,
        borderRadius: 8,
      }
    case 'animAnimNode_StateFrozen':
      return {
        borderColor: '#80b4d8',
        borderWidth: 2,
        borderRadius: 8,
      }
    default:
      return {}
  }
}

function createTypedBox(
  typeName: string,
  id: string,
  data: Record<string, unknown>,
  originalNodeId?: string
): RenderNode {
  const chrome = typeDependentChrome(typeName)
  const box: RenderNode = {
    id,
    type: typeName,
    data: originalNodeId ? { originalNodeId } : {},
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    childSlots: emptyChildSlots(),
    metadata: {},
    bounds: { x: 0, y: 0, width: 120, height: 80 },
    isContainer: false,
    isGroup: false,
    zIndex: 0,
    color: nodeColor(typeName),
    backgroundColor: nodeBackgroundColor(typeName),
    borderColor: '#333',
    borderWidth: 1,
    borderRadius: 4,
    visible: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
  }

  return {
    ...box,
    ...chrome,
  }
}

function createHandleBox(handle: AnimgraphNode): RenderNode {
  return createTypedBox(handle.Data.$type, handle.HandleId, handle.Data, handle.HandleId)
}

function createWrapperBox(
  wrapType: string,
  opts: {
    originalNodeId: string
    inline?: boolean
  }
): RenderNode {
  return {
    id: `wrap_${opts.originalNodeId}`,
    type: wrapType,
    data: { originalNodeId: opts.originalNodeId },
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    childSlots: emptyChildSlots(),
    metadata: opts.inline ? { inline: true } : {},
    bounds: { x: 0, y: 0, width: 120, height: 80 },
    isContainer: true,
    isGroup: false,
    layout: 'horizontal',
    zIndex: 0,
    color: '#666',
    backgroundColor: '#f0f0f0',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 6,
    visible: true,
    opacity: 1,
    scale: 1,
    rotation: 0,
  }
}

function createPropertyGroup(
  ownerId: string,
  fieldName: string,
  children: RenderNode[],
  allNodes: Map<string, RenderNode>
): RenderNode | null {
  if (children.length === 0) return null

  const groupNode: RenderNode = {
    id: `node_${ownerId}_group_${fieldName}`,
    type: DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
    data: {},
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    childSlots: emptyChildSlots(),
    metadata: {
      propertyName: fieldName,
    },
    bounds: { x: 0, y: 0, width: 0, height: 0 },
    isContainer: true,
    isGroup: true,
    groupType: 'property',
    layout: 'vertical',
    spacing: 16,
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
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
  for (const child of children) {
    appendChild(groupNode, child, DEFAULT_CHILD_SLOT)
  }
  return groupNode
}

function collectPinConnections(
  diagramNodes: Iterable<RenderNode>,
  registry: Map<string, AnimgraphNode>
): DiagramConnection[] {
  const connections: DiagramConnection[] = []

  for (const diagramNode of diagramNodes) {
    const handleId = handleIdOfBox(diagramNode)
    if (!handleId) continue
    
    const handle = registry.get(handleId)
    if (!handle) continue

    for (const inputName of NodeDefinitionRegistry.getInputFields(handle.Data.$type)) {
      const inputHandler = NodeDefinitionRegistry.getNodeInputHandler(handle.Data.$type, inputName)
      const count = inputHandler.count(handle)
      for (let i = 0; i < count; i++) {
        const handleLike = inputHandler.get(handle, i)
        if (!handleLike) continue
        const fromId = 'HandleId' in handleLike ? handleLike.HandleId : handleLike.HandleRefId
        if (fromId && registry.has(fromId)) {
          connections.push({
            from: fromId,
            to: handleId,
            type: DIAGRAM_CONNECTION_TYPE_INPUT,
            pinName: `${inputName}[${i}]`,
          })
        }
      }
    }
  }

  return connections
}

function isInlineTyped(value: object): value is Record<string, unknown> & { $type: string } {
  return typeof (value as { $type?: unknown }).$type === 'string'
}

function ancestorList(node: RenderNode): RenderNode[] {
  const list: RenderNode[] = []
  let current: RenderNode | undefined = node
  while (current) {
    list.unshift(current)
    current = current.parent
  }
  return list
}

function isStrictAncestor(ancestor: RenderNode, node: RenderNode): boolean {
  let current: RenderNode | undefined = node.parent
  while (current) {
    if (current.id === ancestor.id) return true
    current = current.parent
  }
  return false
}

/** Last shared node on parent chains (incl. the nodes themselves). */
function lowestCommonAncestor(nodes: RenderNode[]): RenderNode | null {
  if (nodes.length === 0) return null
  const chains = nodes.map(ancestorList)
  if (chains.some((c) => c.length === 0)) return null
  const minLen = Math.min(...chains.map((c) => c.length))
  let i = 0
  while (i < minLen) {
    const id = chains[0]![i]!.id
    if (chains.some((c) => c[i]!.id !== id)) break
    i++
  }
  return i > 0 ? chains[0]![i - 1]! : null
}

/**
 * Diagram parent for a pin target: consumer's parent if one branch, else LCA
 * of all consumer branches (not the first-wins contain PG).
 */
function pinDagPlacementParent(
  target: RenderNode,
  consumers: RenderNode[]
): RenderNode | null {
  const anchors = consumers.filter((c) => c.id !== target.id)
  if (anchors.length === 0) return target.parent ?? null

  const located = target.parent ? [...anchors, target] : anchors
  if (located.length === 1) return located[0]!.parent ?? null

  const lca = lowestCommonAncestor(located)
  if (!lca) return null
  if (lca.id === target.id) return target.parent ?? null
  if (anchors.some((a) => a.id === lca.id)) return lca.parent ?? null
  return lca
}

function isPropertyGroupNode(node: RenderNode): boolean {
  return node.type === DIAGRAM_NODE_TYPE_PROPERTY_GROUP || node.isGroup === true
}

function isUnderNode(node: RenderNode, ancestor: RenderNode): boolean {
  let current: RenderNode | undefined = node.parent
  while (current) {
    if (current.id === ancestor.id) return true
    current = current.parent
  }
  return false
}

function allConsumersUnder(consumers: RenderNode[], ancestor: RenderNode): boolean {
  return consumers.every(
    (c) => c.id === ancestor.id || isUnderNode(c, ancestor)
  )
}

function animTypeOfBox(node: RenderNode): string | null {
  const t = node.type
  return t.startsWith('anim') ? t : null
}

/**
 * Contain PG accepts `childType` when the owner's field is projection `contain`
 * and `isAnimType(childType, fieldTypeName(ref))`.
 */
function canPlaceInPropertyGroup(childType: string, pg: RenderNode): boolean {
  const owner = pg.parent
  const fieldName = pg.metadata?.propertyName
  if (!owner || typeof fieldName !== 'string' || !fieldName) return false
  if (!getProjectedContainFieldNames(owner.type).includes(fieldName)) return false
  const field = getAnimTypeFields(owner.type).find((f) => f.key === fieldName)
  if (!field) return false
  const expected = fieldTypeName(field.type)
  if (!expected || expected === 'unknown') return false
  return isAnimType(childType, expected)
}

/** Pin / link slot target type (`wref` inside a link struct, else unwrapped `ref`). */
function pinSlotExpectedType(fieldType: AnimFieldType): string | null {
  if (isLinkFieldType(fieldType)) {
    const linkName = typeof fieldType === 'string' ? fieldType : fieldTypeName(fieldType)
    return structWrefNodeTarget(linkName)
  }
  const name = fieldTypeName(fieldType)
  return !name || name === 'unknown' ? null : name
}

/** `ref` inferred contain, projection sets `pin` (e.g. OrientConstraint.inputTransforms). */
function isPinOverrideField(ownerType: string, field: AnimFieldDef): boolean {
  const inferred = inferFieldRole(field.type)
  const role = getFieldRole(field, getProjectionDef(ownerType))
  return role === 'pin' && inferred === 'contain'
}

function consumerPinOverrideAccepts(consumerType: string, childType: string): boolean {
  for (const field of getAnimTypeFields(consumerType)) {
    if (!isPinOverrideField(consumerType, field)) continue
    const expected = pinSlotExpectedType(field.type)
    if (expected && isAnimType(childType, expected)) return true
  }
  return false
}

function isPinDagHost(node: RenderNode): boolean {
  return isPropertyGroupNode(node) || isSmInputChainOverviewLeaf(node)
}

/** Shared parent of pin-override consumers; one already-parented consumer is enough (later passes). */
function pinOverrideHost(consumers: RenderNode[]): RenderNode | null {
  const parents = consumers
    .map((c) => c.parent)
    .filter((p): p is RenderNode => !!p && isPinDagHost(p))
  if (parents.length === 0) return null
  const firstId = parents[0]!.id
  if (parents.every((p) => p.id === firstId)) return parents[0]!
  return null
}

/**
 * Pin-override (`ref` → pin): always beside the consumer — no LCA required.
 * Otherwise lift to a contain PG whose `ref` accepts the box (shared AnimNodes).
 */
function legalizePinDagParent(
  proposed: RenderNode | null,
  target: RenderNode,
  consumers: RenderNode[]
): RenderNode | null {
  const childType = animTypeOfBox(target)
  if (
    childType &&
    consumers.length > 0 &&
    consumers.every((c) => {
      const t = animTypeOfBox(c)
      return !!t && consumerPinOverrideAccepts(t, childType)
    })
  ) {
    return pinOverrideHost(consumers) ?? (proposed && isPinDagHost(proposed) ? proposed : null)
  }

  let current: RenderNode | undefined = proposed ?? undefined
  while (current) {
    if (isSmInputChainOverviewLeaf(current)) {
      if (allConsumersUnder(consumers, current)) return current
      current = current.parent
      continue
    }
    if (childType && isPropertyGroupNode(current) && canPlaceInPropertyGroup(childType, current)) {
      return current
    }
    current = current.parent
  }
  return null
}

/**
 * Walk from animGraph.rootNode. Contain fields become PropertyGroups.
 * Wrap only puts the box inside a wrapper. Pin-DAG of any node's children
 * is nested into that same parent (PG, wrapper, …).
 */
export function materializeDiagram(
  data: AnimgraphData,
  registry: Map<string, AnimgraphNode>
): DiagramMaterializeResult {
  const diagramNodeIdToDiagramNode = new Map<string, RenderNode>()
  const handleIdToDiagramNode = new Map<string, RenderNode>()
  const handleIdToWrapperDiagramNode = new Map<string, RenderNode>()
  const consumedHandleIdsSet = new Set<string>()
  const inlineBoxes = new WeakMap<object, RenderNode>()
  const diagramNodeToAnimgraphObject = new WeakMap<RenderNode, AnimgraphObject>()
  const unknownTypeToUsageCount = new Map<string, number>()
  let inlineSeq = 0

  const noteUnknownType = (typeName: string): void => {
    if (!NodeDefinitionRegistry.getNodeDefinition(typeName)) {
      unknownTypeToUsageCount.set(typeName, (unknownTypeToUsageCount.get(typeName) ?? 0) + 1)
    }
  }

  const consumeOwned = (
    typeName: string,
    dataObj: Record<string, unknown>,
    ...roles: Array<'contain' | 'embed' | 'hide'>
  ): void => {
    for (const fieldName of getProjectedFieldNames(typeName, ...roles)) {
      for (const item of fieldItems(dataObj[fieldName])) {
        consumeValue(item)
      }
    }
  }

  const consumeHandle = (handleId: string): void => {
    if (handleIdToDiagramNode.has(handleId) || consumedHandleIdsSet.has(handleId)) return
    consumedHandleIdsSet.add(handleId)
    const handle = registry.get(handleId)
    if (!handle?.Data) return
    consumeOwned(handle.Data.$type, handle.Data, 'contain', 'embed', 'hide')
  }

  const consumeValue = (value: unknown): void => {
    if (value == null) return
    if (typeof value === 'string') {
      const id = resolveHandleId(value, registry)
      if (id) consumeHandle(id)
      return
    }
    if (typeof value !== 'object' || Array.isArray(value)) return

    if (isAnimgraphLinkObject(value)) {
      consumeValue(value.node)
      return
    }
    if (isAnimgraphNodeLikeObject(value)) {
      const id = resolveHandleId(value, registry)
      if (id) consumeHandle(id)
      return
    }
    if (isInlineTyped(value)) {
      consumeOwned(value.$type, value, 'contain', 'embed', 'hide')
    }
  }

  const fillContain = (
    box: RenderNode,
    typeName: string,
    dataObj: Record<string, unknown>
  ): void => {
    for (const fieldName of NodeDefinitionRegistry.getChildFields(typeName)) {
      const fieldData = dataObj[fieldName]
      if (!fieldData) continue

      const items = fieldItems(fieldData)
      const isArray = Array.isArray(fieldData)
      const children: RenderNode[] = []
      const inlineIds: string[] = []
      for (const item of items) {
        const child = placeValue(item)
        if (!child) continue
        
        if (isInlineBox(child)) inlineIds.push(child.id)
        if (!child.parent) children.push(child)
      }

      if (inlineIds.length > 0) {
        box.data = {
          ...box.data,
          inlines: {
            ...box.data.inlines,
            [fieldName]: isArray ? inlineIds : inlineIds[0],
          },
        }
      }

      const group = createPropertyGroup(box.id, fieldName, children, diagramNodeIdToDiagramNode)
      if (!group) continue
      appendChild(box, group, DEFAULT_CHILD_SLOT)
      box.isContainer = true
    }
  }

  const placeHandle = (handleId: string): RenderNode | null => {
    const existingDiagram = handleIdToWrapperDiagramNode.get(handleId) 
      ?? handleIdToDiagramNode.get(handleId)
    if (existingDiagram) return existingDiagram

    const handle = registry.get(handleId)
    if (!handle) return null

    const typeName = handle.Data.$type
    if (isProjectedEmbedded(typeName)) return null

    noteUnknownType(typeName)

    const diagramNode = createHandleBox(handle)
    handleIdToDiagramNode.set(handleId, diagramNode)
    diagramNodeIdToDiagramNode.set(diagramNode.id, diagramNode)
    fillContain(diagramNode, typeName, handle.Data)
    consumeOwned(typeName, handle.Data, 'embed', 'hide')

    const wrapType = getProjectedWrap(typeName)
    if (!wrapType) return diagramNode

    const wrapper = createWrapperBox(wrapType, {
      originalNodeId: handleId,
    })
    diagramNodeIdToDiagramNode.set(wrapper.id, wrapper)
    handleIdToWrapperDiagramNode.set(handleId, wrapper)
    appendChild(wrapper, diagramNode, DEFAULT_CHILD_SLOT)
    return wrapper
  }

  const pinSeed = (member: RenderNode): AnimgraphNode | null => {
    // Handle box only: wrapper also has originalNodeId of the inner node.
    const handleId = handleIdOfBox(member)
    if (handleId && member.id === handleId) return registry.get(handleId) ?? null
    const payload = diagramNodeToAnimgraphObject.get(member)
    if (!payload) return null
    return { HandleId: member.id, Data: payload }
  }

  /** Children are seeds; pin-DAG nodes attach at LCA of all consumer branches. */
  const nestPinInputsIntoParents = (): void => {
    const discoverPinDag = (): void => {
      let size = -1
      while (size !== diagramNodeIdToDiagramNode.size) {
        size = diagramNodeIdToDiagramNode.size
        for (const member of [...diagramNodeIdToDiagramNode.values()]) {
          const seed = pinSeed(member)
          if (!seed) continue
          for (const value of pinInputValues(seed)) {
            placeValue(value)
          }
        }
      }
    }

    const collectPinConsumers = (): Map<string, RenderNode[]> => {
      const byTarget = new Map<string, RenderNode[]>()
      const seen = new Set<string>()
      for (const consumer of diagramNodeIdToDiagramNode.values()) {
        const seed = pinSeed(consumer)
        if (!seed) continue
        for (const value of pinInputValues(seed)) {
          const target = placeValue(value)
          if (!target || target.id === consumer.id) continue
          const edge = `${consumer.id}\0${target.id}`
          if (seen.has(edge)) continue
          seen.add(edge)
          const list = byTarget.get(target.id) ?? []
          list.push(consumer)
          byTarget.set(target.id, list)
        }
      }
      return byTarget
    }

    discoverPinDag()
    let changed = true
    let guard = 0
    const maxPasses = Math.max(8, diagramNodeIdToDiagramNode.size * 2)
    while (changed && guard < maxPasses) {
      changed = false
      guard += 1
      for (const [targetId, consumers] of collectPinConsumers()) {
        const target = diagramNodeIdToDiagramNode.get(targetId)
        if (!target) continue
        const next = legalizePinDagParent(
          pinDagPlacementParent(target, consumers),
          target,
          consumers
        )
        if (next?.id === target.parent?.id) continue
        if (next && (next.id === target.id || isStrictAncestor(target, next))) continue
        if (!next) {
          if (target.parent) {
            removeChild(target.parent, target)
            changed = true
          }
          continue
        }
        appendChild(next, target)
        changed = true
      }
    }
  }

  const placeInline = (
    payload: Record<string, unknown> & { $type: string }
  ): RenderNode | null => {
    const existing = inlineBoxes.get(payload)
    if (existing) return existing

    const typeName = payload.$type
    if (isProjectedEmbedded(typeName)) return null

    noteUnknownType(typeName)

    inlineSeq += 1
    const box = createTypedBox(typeName, `inline_${inlineSeq}`, payload)
    box.metadata = { ...box.metadata, inline: true }
    inlineBoxes.set(payload, box)
    diagramNodeToAnimgraphObject.set(box, asAnimgraphData(payload))
    diagramNodeIdToDiagramNode.set(box.id, box)
    fillContain(box, typeName, payload)
    consumeOwned(typeName, payload, 'embed', 'hide')

    const wrapType = getProjectedWrap(typeName)
    if (!wrapType) return box

    const wrapper = createWrapperBox(wrapType, {
      originalNodeId: box.id,
      inline: true,
    })
    diagramNodeIdToDiagramNode.set(wrapper.id, wrapper)
    inlineBoxes.set(payload, wrapper)
    appendChild(wrapper, box, DEFAULT_CHILD_SLOT)
    return wrapper
  }

  const placeValue = (value: unknown): RenderNode | null => {
    if (value == null) return null
    if (typeof value === 'string') {
      const id = resolveHandleId(value, registry)
      return id ? placeHandle(id) : null
    }
    if (typeof value !== 'object' || Array.isArray(value)) return null

    if (isAnimgraphLinkObject(value)) {
      return placeValue(value.node)
    }
    if (isAnimgraphNodeLikeObject(value)) {
      const id = resolveHandleId(value, registry)
      return id ? placeHandle(id) : null
    }
    if (isInlineTyped(value)) {
      return placeInline(value)
    }
    return null
  }

  const rootBox = placeValue(data.rootNode)
  nestPinInputsIntoParents()

  const floatingHandleIds = new Set<string>()
  for (const [id, handle] of registry) {
    if (handleIdToDiagramNode.has(id) || consumedHandleIdsSet.has(id)) continue
    const typeName = handle.Data?.$type
    if (!typeName || isProjectedEmbedded(typeName)) continue
    floatingHandleIds.add(id)
    placeHandle(id)
  }
  nestPinInputsIntoParents()

  if (floatingHandleIds.size > 0) {
    const summary = [...floatingHandleIds]
      .map((id) => {
        const t = registry.get(id)?.Data?.$type ?? '?'
        return `${id}:${t}`
      })
      .join(', ')
    console.warn(`Floating handles (not reached via projection pins): ${summary}`)
  }

  if (unknownTypeToUsageCount.size > 0) {
    const summary = [...unknownTypeToUsageCount.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([typeName, count]) => `${typeName} (${count})`)
      .join(', ')
    console.warn(`No catalog row for node types: ${summary}`)
  }

  const rootNodes: RenderNode[] = []
  if (rootBox && !rootBox.parent) rootNodes.push(rootBox)
  for (const node of diagramNodeIdToDiagramNode.values()) {
    if (node === rootBox || node.parent) continue
    if (node.type === DIAGRAM_NODE_TYPE_PROPERTY_GROUP) continue
    rootNodes.push(node)
  }

  const connections = collectPinConnections(handleIdToDiagramNode.values(), registry).filter(
    (c) => diagramNodeIdToDiagramNode.has(c.from) && diagramNodeIdToDiagramNode.has(c.to)
  )

  return {
    rootNodes,
    allNodes: diagramNodeIdToDiagramNode,
    connections,
    nodeTypes: new Set([...diagramNodeIdToDiagramNode.values()].map((node) => node.type)),
    floatingHandleIds,
  }
}
