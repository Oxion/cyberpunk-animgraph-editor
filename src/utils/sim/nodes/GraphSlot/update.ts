import { AnimgraphNode } from "@/utils/graph/animgraphTypes"
import { WalkCtx } from "../../SimGraphRunner.types"
import { readBool, readCName, resolveHandle } from "../../simDataUtils"
import { mergeInertializationRequest, requestInertialization } from "../../engineParity"
import { markActive } from "../../simGraphRunnerUtils"

/**
 * GraphSlot OnUpdate: WorkspotInertialization.duration + hit.hitType.
 * Engine: request when duration > 0 && hitType == 0, then clear duration.
 */
export function noteGraphSlotWorkspotInertialization(ctx: WalkCtx): void {
  const duration = ctx.board.getFeature('WorkspotInertialization', 'duration') ?? 0
  const hitType = ctx.board.getFeature('hit', 'hitType') ?? 0
  if (!(duration > 0) || hitType !== 0) return

  requestInertialization(ctx.inertialization, duration)
  ctx.board.setFeature('WorkspotInertialization', 'duration', 0)
}

export function updateGraphSlot(ctx: WalkCtx, node: AnimgraphNode) {
  const {
    handles: handleIdToAnimgraphNodeMap,
    nodes: simNodeStateByHandleIds,
    followUpdate,
  } = ctx

  const nodeData = node.Data ?? {}

  const slotName = readCName(nodeData.name)
  const inputLink = resolveHandle(handleIdToAnimgraphNodeMap, nodeData.inputLink)
  const dontDeactivate = readBool(nodeData.dontDeactivateInput)
  
  const updateInput = dontDeactivate && inputLink 
    ? () => followUpdate(ctx, node, inputLink) 
    : undefined
  
  const nested = slotName
    ? ctx.slotHost.updateNested(slotName, updateInput)
    : undefined

  if (nested) {
    mergeInertializationRequest(ctx.inertialization, nested.inertialization)
    if (nested.keepFullUpdate) ctx.keepFullUpdate = true
    markActive(simNodeStateByHandleIds, node.HandleId, undefined, 1)
    // Engine: when dontDeactivateInput, also Update inputLink from the slot itself.
    if (dontDeactivate) followUpdate(ctx, node, inputLink)
    // Engine: after nested/input Update — WorkspotInertialization + hit gate.
    noteGraphSlotWorkspotInertialization(ctx)
    return
  }

  // No attached graph — passthrough inputLink (engine fallback).
  markActive(simNodeStateByHandleIds, node.HandleId)
  followUpdate(ctx, node, inputLink)
  noteGraphSlotWorkspotInertialization(ctx)
}