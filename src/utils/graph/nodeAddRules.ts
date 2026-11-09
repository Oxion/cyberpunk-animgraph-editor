/**
 * Add-node public API — resolve place → resolveAddProfile → list / canAdd / attach.
 *
 * Diagram target is always a RenderNode (profile.diagramTarget).
 * Animgraph handle attach is optional detail on canAdd / AnimgraphAttachContext.
 */

import type { AnimgraphNode, AnimgraphNodeLike, AnimgraphObject } from './animgraphTypes'
import type { AnimgraphData } from './animgraphTypes'
import type { RenderNode } from './diagramTypes'
import { addHandleRefs, createHandle, deleteHandles } from './animgraphMutation'
import { NodeDefinitionRegistry, type ChildSlotDef } from '../NodeDefinition'
import {
  resolveDiagramAddPlace,
  type DiagramAddActiveView,
  type DiagramAddPlaceContext,
} from './diagramAddPolicy'
import {
  AddProfileTypeResolveResult,
  mergeAmbientResolves,
  resolveAddProfile,
  tryAmbientCanAdd,
  type AddNodeDenialReason,
  type AddProfile,
  type AnimgraphAttachContext,
  type NodeAddRulesContext,
} from './nodeAddProfileDispatch'
import { isRootNodeType } from './animNodeTypeUtils'

export { isRootNodeType } from './animNodeTypeUtils'

export type { AddCatalog } from './nodeAddCatalogs'
export { mergeCatalogs, listUiTypesFromVectors, canAddFromVectors } from './nodeAddCatalogs'
export {
  DiagramNodeDefinitionRegistry,
  type DiagramNodeDefinition,
} from './DiagramNodeDefinition'

export type {
  AddNodeDenialReason,
  AddProfile,
  AnimgraphAttachContext,
  NodeAddRulesContext,
} from './nodeAddProfileDispatch'

export type {
  DiagramAddActiveView,
  DiagramAddPlaceContext,
} from './diagramAddPolicy'

export {
  resolveDiagramAddParentSlot,
  resolveDiagramAddPlace,
} from './diagramAddPolicy'

export { resolveAddProfile } from './nodeAddProfileDispatch'

export type CanAddNodeResult = 
  | {
      ok: true
      diagramNodeType: string
      place: DiagramAddPlaceContext
      animgraphNodeType?: string
      slot?: ChildSlotDef
      animgraphAttach?: AnimgraphAttachContext
    }
  | {
      ok: false
      diagramNodeType: string
      place: DiagramAddPlaceContext
      reasons: AddNodeDenialReason[]
    }

export type ResolveAddIntentResult =
  | {
      status: 'blocked'
      place: DiagramAddPlaceContext
      reasons: AddNodeDenialReason[]
    }
  | {
      status: 'ready'
      place: DiagramAddPlaceContext
      profile: AddProfile
    }

export function resolveChildSlots(
  def: ReturnType<typeof NodeDefinitionRegistry.getNodeDefinition>,
  nodeType?: string
): ChildSlotDef[] {
  return NodeDefinitionRegistry.getChildSlots(def, nodeType)
}

export type ListAddableTypesForSelectionResult = {
  place: DiagramAddPlaceContext
  ok: boolean
  reasons: AddNodeDenialReason[]
  resolves: AddProfileTypeResolveResult[]
  diagramTarget?: RenderNode | null
  parentSlot?: string
  /** e.g. `ParentType.slot` when animgraph slot profile is active. */
  slotLabel?: string
}

export function listAddableTypesForSelection(
  selection: RenderNode | null | undefined,
  ctx: NodeAddRulesContext,
  activeView?: DiagramAddActiveView
): ListAddableTypesForSelectionResult {
  const place = resolveDiagramAddPlace(selection, activeView ?? null, ctx.allNodes)
  const profileResolveResult = resolveAddProfile(ctx, place)

  if (profileResolveResult.status === 'deny') {
    return {
      place,
      ok: false,
      reasons: profileResolveResult.reasons,
      resolves: [],
      diagramTarget: place.diagramTarget,
      parentSlot: place.parentSlot,
    }
  }

  const { profile } = profileResolveResult

  return {
    place,
    ok: true,
    reasons: [],
    resolves: mergeAmbientResolves(place, profile.resolveTypes(ctx)),
    diagramTarget: profile.diagramTarget,
    parentSlot: profile.parentSlot,
    slotLabel: profile.slotLabel,
  }
}

export function canAddNode(
  selection: RenderNode | null | undefined,
  diagramNodeType: string,
  ctx: NodeAddRulesContext,
  activeView?: DiagramAddActiveView,
  preferredSlotName?: string
): CanAddNodeResult {
  const place = resolveDiagramAddPlace(selection, activeView ?? null, ctx.allNodes)

  if (isRootNodeType(diagramNodeType)) {
    return {
      ok: false,
      place,
      reasons: ['root-forbidden'],
      diagramNodeType: diagramNodeType,
    }
  }

  const profileResolveResult = resolveAddProfile(ctx, place)

  if (profileResolveResult.status === 'deny') {
    return {
      ok: false,
      reasons: profileResolveResult.reasons,
      place,
      diagramNodeType: diagramNodeType,
    }
  }

  const gate = profileResolveResult.profile.canAddType(
    diagramNodeType,
    ctx,
    preferredSlotName
  )
  if (gate.ok) {
    return {
      ...gate,
      place,
    }
  }
  const ambient = tryAmbientCanAdd(place, diagramNodeType)
  if (ambient) {
    return {
      ...ambient,
      place,
    }
  }
  return {
    ...gate,
    place,
  }
}

export function listParentSlotMap(): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const type of NodeDefinitionRegistry.getAllNodeTypes()) {
    const slots = resolveChildSlots(NodeDefinitionRegistry.getNodeDefinition(type), type)
    if (slots.length > 0) out[type] = slots.map((s) => s.name)
  }
  return out
}

export function makeAnimgraphAddTarget(
  parentHandle: AnimgraphNode,
  slotName: string,
  _propertyGroup?: RenderNode
): AnimgraphAttachContext | null {
  const parentType = String(parentHandle.Data?.$type ?? '')
  const slot = NodeDefinitionRegistry.getChildSlot(
    NodeDefinitionRegistry.getNodeDefinition(parentType),
    slotName,
    parentType
  )
  if (!slot) return null
  return {
    parentHandle,
    parentType,
    slot,
  }
}

export function attachNewHandleToSlot(
  ctx: NodeAddRulesContext & {
    originalAnimgraph: AnimgraphData | { nodesToInit: AnimgraphNodeLike[] }
  },
  handleId: string,
  nodeType: string,
  attach: AnimgraphAttachContext,
  dataPatch?: AnimgraphObject,
  _options?: { initInAnimgraph?: boolean }
): { ok: true } | { ok: false; message: string } {
  const parent = attach.parentHandle
  const slotName = attach.slot.name

  const template = NodeDefinitionRegistry.getHandleTypeDataTemplate(nodeType)
  const data = {
    $type: nodeType,
    ...(template ? structuredClone(template) : {}),
    ...(dataPatch ?? {}),
  } as AnimgraphObject

  const animgraph: AnimgraphData =
    'rootNode' in ctx.originalAnimgraph
      ? (ctx.originalAnimgraph as AnimgraphData)
      : {
          nodesToInit: ctx.originalAnimgraph.nodesToInit,
          rootNode: { HandleRefId: '' },
        }

  const mutationCtx = {
    handlesRegistry: ctx.handlesRegistry,
    animgraph,
  }
  createHandle(mutationCtx, handleId, data)

  const attachResult = addHandleRefs(
    mutationCtx,
    parent.HandleId,
    slotName,
    [handleId]
  )
  if (!attachResult.ok) {
    deleteHandles(mutationCtx, [handleId])
    return { ok: false, message: attachResult.message }
  }

  return { ok: true }
}
