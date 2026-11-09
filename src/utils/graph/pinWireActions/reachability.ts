/**
 * Diagram-facing reachability helpers — delegates to animgraph mutation layer.
 * Reachability = root→tree walk (export / inline graduate). Not floating.
 */

import type { RenderData } from '../diagramTypes'
import {
  collectHandlesReachableFromRoot as collectHandlesReachableFromRootCtx,
  isHandleReachableFromRoot as isHandleReachableFromRootCtx,
} from '../animgraphMutation'
import { mutationCtxFromRenderData } from '../diagramMutationCtx'

export function collectHandlesReachableFromRoot(
  renderData: RenderData
): Set<string> {
  return collectHandlesReachableFromRootCtx(mutationCtxFromRenderData(renderData))
}

export function isHandleReachableFromRoot(
  renderData: RenderData,
  handleId: string
): boolean {
  return isHandleReachableFromRootCtx(
    mutationCtxFromRenderData(renderData),
    handleId
  )
}

/** @deprecated Use collectHandlesReachableFromRoot */
export const collectReachableHandleIds = collectHandlesReachableFromRoot

/** @deprecated Use isHandleReachableFromRoot */
export const isHandleReachableFromNodesToInit = isHandleReachableFromRoot

/** After wiring: is consumer on the root tree (inline embed graduate)? */
export function isConsumerReachable(
  renderData: RenderData,
  consumerHandleId: string
): boolean {
  return isHandleReachableFromRoot(renderData, consumerHandleId)
}
