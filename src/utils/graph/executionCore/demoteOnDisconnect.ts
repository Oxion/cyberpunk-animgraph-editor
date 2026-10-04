import type { DiagramConnection, RenderData } from '../diagramTypes'
import { ensureFloatingHandleIds } from '../floatingHandles'
import {
  collectReverseProducerHandleIds,
  collectStructuralCoreHandleIds,
} from './collectStructuralCore'
import { isExecutionInitAnchor, isExecutionSink } from './resolve'

function isInNodesToInit(renderData: RenderData, handleId: string): boolean {
  const nodesToInit = renderData.originalAnimgraph?.nodesToInit
  if (!nodesToInit) return false
  return nodesToInit.some(
    (ref) =>
      typeof ref === 'object' &&
      ref &&
      'HandleRefId' in ref &&
      String((ref as { HandleRefId: string }).HandleRefId) === handleId
  )
}

function removeFromNodesToInit(renderData: RenderData, handleId: string): void {
  const nodesToInit = renderData.originalAnimgraph?.nodesToInit
  if (!nodesToInit) return
  for (let i = nodesToInit.length - 1; i >= 0; i--) {
    const ref = nodesToInit[i]
    if (
      typeof ref === 'object' &&
      ref &&
      'HandleRefId' in ref &&
      String((ref as { HandleRefId: string }).HandleRefId) === handleId
    ) {
      nodesToInit.splice(i, 1)
    }
  }
}

function isProtectedInitSeed(renderData: RenderData, handleId: string): boolean {
  const handle = renderData.handlesRegistry.get(handleId)
  if (!handle?.Data?.$type) return false
  return isExecutionInitAnchor(String(handle.Data.$type))
}

function unpromoteHandle(renderData: RenderData, handleId: string): void {
  if (!renderData.handlesRegistry.has(handleId)) return
  removeFromNodesToInit(renderData, handleId)
  ensureFloatingHandleIds(renderData).add(handleId)
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

/**
 * After disconnect: drop nodesToInit seeds that no longer lie on the structural
 * execution core. On disconnect into Output, also demote producer subbranch behind `from`.
 */
export function demoteOrphanNodesToInitAfterDisconnect(
  renderData: RenderData,
  conn: DiagramConnection,
  logicalToHandleId: string,
  logicalToType: string
): string[] {
  const core = collectStructuralCoreHandleIds(renderData)
  const demoted: string[] = []
  const pending = new Set<string>()

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

  for (const ref of renderData.originalAnimgraph?.nodesToInit ?? []) {
    const id =
      typeof ref === 'object' && ref && 'HandleRefId' in ref
        ? String((ref as { HandleRefId: string }).HandleRefId)
        : null
    queueDemote(id)
  }

  for (const handleId of pending) {
    if (!isInNodesToInit(renderData, handleId)) continue
    if (isProtectedInitSeed(renderData, handleId)) continue
    if (core.has(handleId)) continue
    unpromoteHandle(renderData, handleId)
    demoted.push(handleId)
  }

  return demoted
}
