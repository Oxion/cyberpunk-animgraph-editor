/**
 * Add-node plan + apply — gate → diagram builder → per-type actions → mutate.
 * No UI strings; callers map `{ ok: false, message }` / reason codes.
 */

import type { AnimgraphNode, AnimgraphObject } from './animgraphTypes'
import type { RenderData, RenderNode } from './diagramTypes'
import { NodeDefinitionRegistry } from '../NodeDefinition'
import {
  resolveAddNodeActions,
  type AddNodeAction,
  type EnsureDiagramChildAction,
  type PlaceInParentAction,
  type PlaceInParentMode,
} from './addNodeActions'
import { buildDiagramNode } from './diagramAddBuilders'
import { isPropertyGroupNode } from './diagramAddPolicy'
import { fitDiagramFrameToChildren, isDiagramFrameNode } from './diagramFrameNodes'
import { addFloatingHandle, removeFloatingHandle } from './floatingHandles'
import {
  captureAddedNodePlacement,
  removeNodeFromGraphData,
  restoreNodeToGraphData,
  type AddedNodePlacement,
} from './GraphHistory'
import {
  allocateNextNumericId,
  appendChildToPropertyGroup,
  computeSizeForNewNodeType,
  createMinimalRenderNode,
  ensurePropertyGroup,
  fitPropertyGroupToChildren,
  type BootstrapAttachCtx,
} from './nodeAddBootstrap'
import {
  attachNewHandleToSlot,
  makeAnimgraphAddTarget,
  type AnimgraphAttachContext,
  type CanAddNodeResult
} from './nodeAddRules'
import { appendChild, DEFAULT_CHILD_SLOT } from './nodeChildSlots'
import { applyNodeFootprint } from './nodeFootprint'

export type {
  AddNodeAction,
  AddNodeActionKind,
  AddNodeActionMap,
  PlaceInParentMode
} from './addNodeActions'

export type SlotHandleMutationSnapshot = {
  kind: 'slot'
  handleId: string
  animgraphNodeType: string
  attach: AnimgraphAttachContext
  beforeSlot: unknown
  nodesToInitLen: number
  bootstrapHandles: Array<{ handleId: string; nodeType: string; slotName: string }>
}

export type FloatingHandleMutationSnapshot = {
  kind: 'floating'
  handleId: string
  animgraphNodeType: string
  /** Cloned Data for redo (pre-bootstrap). */
  data: AnimgraphObject
  nodesToInitLen: number
  bootstrapHandles: Array<{ handleId: string; nodeType: string; slotName: string }>
}

export type HandleMutationSnapshot = (
  | SlotHandleMutationSnapshot
  | FloatingHandleMutationSnapshot
) & {
  /** Copied handle Data merged after attach (paste). Link refs stripped. */
  dataOverlay?: AnimgraphObject
}

export function applyHandleDataOverlay(
  graphData: RenderData,
  handleId: string,
  overlay: AnimgraphObject
): void {
  const handle = graphData.handlesRegistry.get(handleId)
  if (!handle?.Data) return
  const type = handle.Data.$type
  handle.Data = {
    ...handle.Data,
    ...structuredClone(overlay),
    $type: type,
  } as AnimgraphObject
}

export type AddNodePlan = {
  id: string
  diagramNodeType: string
  animgraphNodeType: string
  node: RenderNode
  diagramParent: RenderNode | null
  parentSlot: string
  actions: AddNodeAction[]
}

export type BuildAddNodePlanInput = {
  id: string
  gate: Extract<CanAddNodeResult, { ok: true }>
  viewportCenter: { x: number; y: number }
  diagramData: RenderData
  preferredSlotName?: string
  /** Paste: keep clipboard-relative layout instead of append/stack placement. */
  preserveLayout?: boolean
  localPosition?: { x: number; y: number }
  /** Paste: restore original child slot when it differs from gate place. */
  parentSlotOverride?: string
  /** Paste: registry + slot refs only; promotion via wire connect. */
  initInAnimgraph?: boolean
}

function withPlanInitInAnimgraph(
  actions: AddNodeAction[],
  initInAnimgraph: boolean | undefined
): AddNodeAction[] {
  if (initInAnimgraph !== false) return actions
  return actions.map((action) => {
    if (action.kind === 'attach-handle' || action.kind === 'attach-handle-to') {
      return { ...action, initInAnimgraph: false }
    }
    return action
  })
}

export function buildAddNodePlan(input: BuildAddNodePlanInput): AddNodePlan {
  const {
    id,
    gate,
    viewportCenter,
    diagramData,
    preferredSlotName,
    preserveLayout,
    localPosition,
    parentSlotOverride,
    initInAnimgraph,
  } = input
  const diagramNodeType = gate.diagramNodeType
  const animgraphNodeType = gate.animgraphNodeType ?? gate.diagramNodeType
  const diagramParent = gate.place.diagramTarget ?? null
  const parentSlot =
    parentSlotOverride ?? gate.place.parentSlot ?? DEFAULT_CHILD_SLOT

  const reserved = new Set<string>([id])
  const allocId = () => {
    const next = allocateNextNumericId(diagramData, reserved)
    reserved.add(next)
    return next
  }

  const resolved = resolveAddNodeActions({
    id,
    gate,
    diagramNodeType,
    animgraphNodeType,
    diagramParent,
    parentSlot,
    ctx: diagramData,
    allocId,
  })

  const node = buildDiagramNode({
    id,
    diagramNodeType,
    animgraphNodeType,
    gate,
    viewportCenter,
    diagramData,
    preferredSlotName,
    rootHandleId: resolved.rootHandleId,
    ...(localPosition ? { localPosition } : {}),
  })

  let actions = withPlanInitInAnimgraph(resolved.actions, initInAnimgraph)
  if (preserveLayout) {
    actions = actions.map((action) =>
      action.kind === 'place-in-parent'
        ? { ...action, mode: 'preserve-position' as const }
        : action
    )
  }

  return {
    id,
    diagramNodeType,
    animgraphNodeType,
    node,
    diagramParent,
    parentSlot,
    actions,
  }
}

export type ApplyAddNodeResult =
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

function snapshotBeforeSlot(attach: AnimgraphAttachContext): unknown {
  const slotName = attach.slot.name
  return attach.parentHandle.Data[slotName] === undefined
    ? undefined
    : structuredClone(attach.parentHandle.Data[slotName])
}

export function revertHandleMutation(
  graphData: RenderData,
  snapshot: HandleMutationSnapshot
): void {
  if (snapshot.kind === 'floating') {
    for (const h of snapshot.bootstrapHandles) {
      graphData.handlesRegistry.delete(h.handleId)
    }
    removeFloatingHandle(graphData, snapshot.handleId)
    const nodesToInit = graphData.originalAnimgraph?.nodesToInit
    if (nodesToInit) {
      while (nodesToInit.length > snapshot.nodesToInitLen) nodesToInit.pop()
    }
    return
  }

  const { parentHandle, slotName } = {
    parentHandle: snapshot.attach.parentHandle,
    slotName: snapshot.attach.slot.name,
  }
  if (snapshot.beforeSlot === undefined) {
    delete parentHandle.Data[slotName]
  } else {
    parentHandle.Data[slotName] = structuredClone(snapshot.beforeSlot) as never
  }
  for (const h of snapshot.bootstrapHandles) {
    graphData.handlesRegistry.delete(h.handleId)
  }
  graphData.handlesRegistry.delete(snapshot.handleId)
  const nodesToInit = graphData.originalAnimgraph?.nodesToInit
  if (nodesToInit) {
    while (nodesToInit.length > snapshot.nodesToInitLen) nodesToInit.pop()
  }
}

export function replayHandleMutation(
  graphData: RenderData,
  snapshot: HandleMutationSnapshot
): { ok: true } | { ok: false; message: string } {
  if (snapshot.kind === 'floating') {
    if (graphData.handlesRegistry.has(snapshot.handleId)) {
      return { ok: false, message: `Handle '${snapshot.handleId}' already exists` }
    }
    const handle: AnimgraphNode = {
      HandleId: snapshot.handleId,
      Data: structuredClone(snapshot.data),
    }
    addFloatingHandle(graphData, handle)

    if (!graphData.originalAnimgraph) {
      return { ok: false, message: 'No original animgraph; cannot replay bootstrap' }
    }
    const ctx: BootstrapAttachCtx = {
      handlesRegistry: graphData.handlesRegistry,
      allNodes: graphData.allNodes,
      originalAnimgraph: graphData.originalAnimgraph,
    }
    const restoredParent = graphData.handlesRegistry.get(snapshot.handleId)
    if (!restoredParent) {
      return { ok: false, message: `Handle '${snapshot.handleId}' missing after floating register` }
    }
    for (const h of snapshot.bootstrapHandles) {
      const childTarget = makeAnimgraphAddTarget(restoredParent, h.slotName)
      if (!childTarget) {
        return { ok: false, message: `Bootstrap target missing: ${h.slotName}` }
      }
      const childAttach = attachNewHandleToSlot(
        ctx,
        h.handleId,
        h.nodeType,
        childTarget,
        undefined,
        { initInAnimgraph: false }
      )
      if (!childAttach.ok) return childAttach
    }
    return { ok: true }
  }

  if (!graphData.originalAnimgraph) {
    return { ok: false, message: 'No original animgraph; cannot replay handle attach' }
  }
  const ctx: BootstrapAttachCtx = {
    handlesRegistry: graphData.handlesRegistry,
    allNodes: graphData.allNodes,
    originalAnimgraph: graphData.originalAnimgraph,
  }
  const primary = attachNewHandleToSlot(
    ctx,
    snapshot.handleId,
    snapshot.animgraphNodeType,
    snapshot.attach
  )
  if (!primary.ok) return primary

  const restoredParent = graphData.handlesRegistry.get(snapshot.handleId)
  if (!restoredParent) {
    return { ok: false, message: `Handle '${snapshot.handleId}' missing after attach` }
  }

  for (const h of snapshot.bootstrapHandles) {
    const childTarget = makeAnimgraphAddTarget(restoredParent, h.slotName)
    if (!childTarget) {
      return { ok: false, message: `Bootstrap target missing: ${h.slotName}` }
    }
    const childAttach = attachNewHandleToSlot(ctx, h.handleId, h.nodeType, childTarget)
    if (!childAttach.ok) return childAttach
  }
  return { ok: true }
}

function addNodeLabel(handle?: HandleMutationSnapshot, ensuredCount = 0): string {
  if (!handle && ensuredCount === 0) return 'Add node'
  if (!handle) return 'Add node + diagram child'
  if (handle.kind === 'floating') {
    if (handle.bootstrapHandles.length > 0) {
      return ensuredCount > 0
        ? 'Add node + floating handle + bootstrap + diagram child'
        : 'Add node + floating handle + bootstrap'
    }
    return ensuredCount > 0
      ? 'Add node + floating handle + diagram child'
      : 'Add node + floating handle'
  }
  if (handle.bootstrapHandles.length > 0) return 'Add node + handle + bootstrap'
  if (ensuredCount > 0) return 'Add node + handle + diagram child'
  return 'Add node + handle'
}

function buildEnsuredDiagramChild(
  diagramData: RenderData,
  action: EnsureDiagramChildAction
): RenderNode {
  const draft = createMinimalRenderNode({
    id: action.id,
    type: action.diagramNodeType,
    size: { width: 240, height: 80 },
  })
  const size = computeSizeForNewNodeType(
    diagramData,
    draft,
  )
  return createMinimalRenderNode({
    id: action.id,
    type: action.diagramNodeType,
    size,
    position: { x: 16, y: 40 },
  })
}

function registerDiagramNode(graphData: RenderData, node: RenderNode): void {
  graphData.allNodes.set(node.id, node)
  graphData.nodeTypes.add(node.type)
}

function placePrimaryInParent(
  graphData: RenderData,
  plan: AddNodePlan,
  mode: PlaceInParentMode
): { ok: true } | { ok: false; message: string } {
  const { node, diagramParent, parentSlot } = plan

  if (!diagramParent) {
    graphData.rootNodes.push(node)
    registerDiagramNode(graphData, node)
    return { ok: true }
  }

  if (mode === 'append-bottom-grow') {
    if (!isPropertyGroupNode(diagramParent)) {
      return {
        ok: false,
        message: `place-in-parent mode 'append-bottom-grow' requires PropertyGroup parent`,
      }
    }
    appendChildToPropertyGroup(diagramParent, node, { grow: true })
  } else {
    const w = node.size?.width ?? 240
    const h = node.size?.height ?? 80
    const px = node.position?.x ?? 0
    const py = node.position?.y ?? 0
    node.bounds = { x: px, y: py, width: w, height: h }
    appendChild(diagramParent, node, parentSlot)
    if (isPropertyGroupNode(diagramParent)) {
      fitPropertyGroupToChildren(diagramParent)
    } else if (isDiagramFrameNode(diagramParent)) {
      fitDiagramFrameToChildren(diagramParent)
    }
  }

  registerDiagramNode(graphData, node)
  return { ok: true }
}

function resolveEnsureChildParent(
  graphData: RenderData,
  plan: AddNodePlan,
  action: EnsureDiagramChildAction
): { ok: true; parent: RenderNode; parentSlot: string } | { ok: false; message: string } {
  if (action.parent.kind === 'primary') {
    return {
      ok: true,
      parent: plan.node,
      parentSlot: action.parent.parentSlot ?? DEFAULT_CHILD_SLOT,
    }
  }

  const owner = graphData.allNodes.get(action.parent.ownerDiagramId)
  if (!owner) {
    return {
      ok: false,
      message: `ensure-diagram-child owner '${action.parent.ownerDiagramId}' missing`,
    }
  }
  const { group } = ensurePropertyGroup(owner, action.parent.slotName, graphData.allNodes)
  return { ok: true, parent: group, parentSlot: DEFAULT_CHILD_SLOT }
}

function rollbackPartialAdd(
  graphData: RenderData,
  plan: AddNodePlan,
  handle: HandleMutationSnapshot | undefined,
  ensuredIds: string[],
  primaryPlaced: boolean
): void {
  if (handle) revertHandleMutation(graphData, handle)
  for (const eid of [...ensuredIds].reverse()) {
    const node = graphData.allNodes.get(eid)
    if (!node) continue
    removeNodeFromGraphData(
      graphData,
      captureAddedNodePlacement(graphData, node, node.parent ?? plan.node)
    )
  }
  if (primaryPlaced) {
    removeNodeFromGraphData(
      graphData,
      captureAddedNodePlacement(graphData, plan.node, plan.diagramParent)
    )
  }
}

function syncPrimaryFootprint(graphData: RenderData, plan: AddNodePlan): void {
  applyNodeFootprint(plan.node, graphData)

  const place = plan.actions.find(
    (a): a is PlaceInParentAction => a.kind === 'place-in-parent'
  )
  if (
    (place?.mode === 'append-bottom-grow' || place?.mode === 'preserve-position') &&
    plan.diagramParent &&
    isPropertyGroupNode(plan.diagramParent)
  ) {
    fitPropertyGroupToChildren(plan.diagramParent)
  }
}

export function applyAddNodePlan(
  graphData: RenderData,
  plan: AddNodePlan
): ApplyAddNodeResult {
  const nodesToInitLen = graphData.originalAnimgraph?.nodesToInit.length ?? 0
  let handle: HandleMutationSnapshot | undefined
  const ensuredIds: string[] = []
  let primaryPlaced = false

  const fail = (message: string): ApplyAddNodeResult => {
    rollbackPartialAdd(graphData, plan, handle, ensuredIds, primaryPlaced)
    return { ok: false, message }
  }

  for (const action of plan.actions) {
    switch (action.kind) {
      case 'place-in-parent': {
        if (primaryPlaced) {
          return fail('place-in-parent already executed')
        }
        const placed = placePrimaryInParent(graphData, plan, action.mode)
        if (!placed.ok) return fail(placed.message)
        primaryPlaced = true
        break
      }
      case 'ensure-property-group': {
        if (!primaryPlaced) {
          return fail('ensure-property-group before place-in-parent')
        }
        const owner = graphData.allNodes.get(action.ownerDiagramId)
        if (!owner) {
          return fail(`ensure-property-group owner '${action.ownerDiagramId}' missing`)
        }
        const { group, created } = ensurePropertyGroup(
          owner,
          action.slotName,
          graphData.allNodes
        )
        if (created) {
          registerDiagramNode(graphData, group)
          ensuredIds.push(group.id)
        }
        break
      }
      case 'ensure-diagram-child': {
        if (!primaryPlaced) {
          return fail('ensure-diagram-child before place-in-parent')
        }
        if (graphData.allNodes.has(action.id) || graphData.handlesRegistry.has(action.id)) {
          return fail(`Id '${action.id}' already exists`)
        }
        const parentResolve = resolveEnsureChildParent(graphData, plan, action)
        if (!parentResolve.ok) return fail(parentResolve.message)

        const child = buildEnsuredDiagramChild(graphData, action)
        if (isPropertyGroupNode(parentResolve.parent)) {
          appendChildToPropertyGroup(parentResolve.parent, child, { grow: true })
        } else {
          appendChild(parentResolve.parent, child, parentResolve.parentSlot)
        }
        registerDiagramNode(graphData, child)
        ensuredIds.push(child.id)
        break
      }
      case 'attach-handle': {
        if (graphData.handlesRegistry.has(action.handleId)) {
          return fail(`Handle '${action.handleId}' already exists`)
        }
        if (!graphData.originalAnimgraph) {
          return fail('No original animgraph; cannot attach handle')
        }

        const beforeSlot = snapshotBeforeSlot(action.attach)
        const attachCtx: BootstrapAttachCtx = {
          handlesRegistry: graphData.handlesRegistry,
          allNodes: graphData.allNodes,
          originalAnimgraph: graphData.originalAnimgraph,
        }
        const attachResult = attachNewHandleToSlot(
          attachCtx,
          action.handleId,
          action.animgraphNodeType,
          action.attach,
          undefined,
          { initInAnimgraph: action.initInAnimgraph !== false }
        )
        if (!attachResult.ok) return fail(attachResult.message)

        handle = {
          kind: 'slot',
          handleId: action.handleId,
          animgraphNodeType: action.animgraphNodeType,
          attach: action.attach,
          beforeSlot,
          nodesToInitLen,
          bootstrapHandles: [],
        }
        break
      }
      case 'attach-handle-to': {
        if (!handle) {
          return fail('attach-handle-to before attach-handle / register-floating-handle')
        }
        if (graphData.handlesRegistry.has(action.handleId)) {
          return fail(`Handle '${action.handleId}' already exists`)
        }
        if (!graphData.originalAnimgraph) {
          return fail('No original animgraph; cannot attach handle')
        }

        const parentHandle = graphData.handlesRegistry.get(action.parentHandleId)
        if (!parentHandle) {
          return fail(`Parent handle '${action.parentHandleId}' missing`)
        }
        const target = makeAnimgraphAddTarget(parentHandle, action.slotName)
        if (!target) {
          return fail(
            `No child slot '${action.slotName}' on ${String(parentHandle.Data?.$type ?? '')}`
          )
        }

        const attachCtx: BootstrapAttachCtx = {
          handlesRegistry: graphData.handlesRegistry,
          allNodes: graphData.allNodes,
          originalAnimgraph: graphData.originalAnimgraph,
        }
        const attachResult = attachNewHandleToSlot(
          attachCtx,
          action.handleId,
          action.animgraphNodeType,
          target,
          undefined,
          { initInAnimgraph: action.initInAnimgraph !== false }
        )
        if (!attachResult.ok) return fail(attachResult.message)

        handle.bootstrapHandles.push({
          handleId: action.handleId,
          nodeType: action.animgraphNodeType,
          slotName: action.slotName,
        })
        break
      }
      case 'register-floating-handle': {
        if (graphData.handlesRegistry.has(action.handleId)) {
          return fail(`Handle '${action.handleId}' already exists`)
        }
        const template = NodeDefinitionRegistry.getHandleTypeDataTemplate(
          action.animgraphNodeType
        )
        const data = {
          $type: action.animgraphNodeType,
          ...(template ? structuredClone(template) : {}),
        } as AnimgraphObject
        const floating: AnimgraphNode = {
          HandleId: action.handleId,
          Data: data,
        }
        const nodesToInitLen = graphData.originalAnimgraph?.nodesToInit?.length ?? 0
        addFloatingHandle(graphData, floating)
        handle = {
          kind: 'floating',
          handleId: action.handleId,
          animgraphNodeType: action.animgraphNodeType,
          data: structuredClone(data),
          nodesToInitLen,
          bootstrapHandles: [],
        }
        break
      }
      default: {
        const _exhaustive: never = action
        return fail(`Unknown action: ${JSON.stringify(_exhaustive)}`)
      }
    }
  }

  if (!primaryPlaced) {
    return fail('plan has no place-in-parent action')
  }

  // Recompute footprint after handle attach (overview body uses animgraph data).
  syncPrimaryFootprint(graphData, plan)

  const placement = captureAddedNodePlacement(graphData, plan.node, plan.diagramParent)
  const ensuredPlacements = ensuredIds
    .map((nid) => {
      const node = graphData.allNodes.get(nid)
      if (!node) return null
      return captureAddedNodePlacement(graphData, node, node.parent ?? plan.node)
    })
    .filter((p): p is AddedNodePlacement => !!p)

  const placements = [placement, ...ensuredPlacements]
  const parentRefreshIds = plan.diagramParent ? [plan.diagramParent.id] : []

  return {
    ok: true,
    primaryNode: plan.node,
    placements,
    handle,
    parentRefreshIds,
    allAddedIds: placements.map((p) => p.node.id),
    label: addNodeLabel(handle, ensuredIds.length),
  }
}

/** Restore diagram placements after handles have been replayed (redo path). */
export function restoreAddNodePlacements(
  graphData: RenderData,
  placements: AddedNodePlacement[]
): void {
  for (const placement of placements) {
    restoreNodeToGraphData(graphData, placement)
  }
}

export function removeAddNodePlacements(
  graphData: RenderData,
  placements: AddedNodePlacement[]
): void {
  for (const placement of [...placements].reverse()) {
    removeNodeFromGraphData(graphData, placement)
  }
}