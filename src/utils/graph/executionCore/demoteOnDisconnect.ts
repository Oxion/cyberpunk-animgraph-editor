import type { DiagramConnection, RenderData } from '../diagramTypes'
import { countInboundHandleRefs } from '../animgraphMutation'
import { mutationCtxFromRenderData } from '../diagramMutationCtx'
import { ensureFloatingHandleIds } from '../floatingHandles'
import { collectReverseProducerHandleIds } from './collectStructuralCore'
import { isExecutionInitAnchor, isExecutionSink } from './resolve'

function isProtectedInitSeed(renderData: RenderData, handleId: string): boolean {
  const handle = renderData.handlesRegistry.get(handleId)
  if (!handle?.Data?.$type) return false
  return isExecutionInitAnchor(String(handle.Data.$type))
}

function resolveFromHandleId(
  renderData: RenderData,
  conn: DiagramConnection
): string | null {
  const fromNode = renderData.allNodes.get(conn.from)
  if (!fromNode) return null
  const id = fromNode.data?.originalNodeId ?? fromNode.id
  return renderData.handlesRegistry.has(id) ? id : null
}

export type DemoteOrphanResult = {
  demotedHandleIds: string[]
  /** Container owner diagram boxes whose Data.nodes may have changed. */
  containOwnerRefreshIds: string[]
}

/**
 * After disconnect: mark floating when a handle is unattached
 * (zero outbound ∧ not contained ∧ not root). No nodesToInit / structural-core.
 */
export function demoteOrphanNodesToInitAfterDisconnect(
  renderData: RenderData,
  conn: DiagramConnection,
  logicalToHandleId: string,
  logicalToType: string
): DemoteOrphanResult {
  const demoted: string[] = []
  const containOwnerRefreshIds: string[] = []
  const pending = new Set<string>()
  const ctx = mutationCtxFromRenderData(renderData)

  const toHandle = renderData.handlesRegistry.get(logicalToHandleId)
  const toType = toHandle?.Data?.$type
    ? String(toHandle.Data.$type)
    : logicalToType

  const queueDemote = (handleId: string | null | undefined) => {
    if (!handleId) return
    pending.add(handleId)
  }

  queueDemote(resolveFromHandleId(renderData, conn))

  if (isExecutionSink(toType)) {
    const fromHandleId = resolveFromHandleId(renderData, conn)
    if (fromHandleId) {
      for (const id of collectReverseProducerHandleIds(renderData, fromHandleId)) {
        queueDemote(id)
      }
    }
  }

  for (const handleId of pending) {
    if (!renderData.handlesRegistry.has(handleId)) continue
    if (isProtectedInitSeed(renderData, handleId)) continue
    if (countInboundHandleRefs(ctx, handleId) > 0) continue
    ensureFloatingHandleIds(renderData).add(handleId)
    demoted.push(handleId)
  }

  return { demotedHandleIds: demoted, containOwnerRefreshIds }
}
