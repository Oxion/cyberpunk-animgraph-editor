import type { AppCommandArgs } from '../commands/types'
import { currentView, setViewSelection } from '../stores/bodyViews'
import { getActiveDiagramRenderer } from '../stores/diagramRenderers'
import { getActiveRenderData } from '../stores/graphProject'
import { selectedNodeIdsRef, selectedNodeRef } from '../stores/graphSession'
import type { DiagramConnection } from '../utils/graph/diagramTypes'
import { Commands } from './ids'

export function collectInputNodeIds(
  seedIds: Iterable<string>,
  connections: DiagramConnection[],
  recursive: boolean
): string[] {
  const collected = new Set<string>()
  let frontier = new Set(seedIds)
  const expanded = new Set<string>()

  while (frontier.size > 0) {
    const nextFrontier = new Set<string>()
    for (const nodeId of frontier) {
      if (expanded.has(nodeId)) continue
      expanded.add(nodeId)

      for (const conn of connections) {
        if (conn.to !== nodeId) continue
        collected.add(conn.from)
        if (recursive && !expanded.has(conn.from)) {
          nextFrontier.add(conn.from)
        }
      }
    }
    frontier = nextFrontier
  }

  return [...collected]
}

export function selectInputsAdd(args: AppCommandArgs<typeof Commands.selectInputs.add>) {
  const active = getActiveDiagramRenderer()
  const data = getActiveRenderData()
  if (!data || !active || selectedNodeIdsRef.value.length === 0) return

  const merged = new Set(selectedNodeIdsRef.value)
  for (const id of collectInputNodeIds(
    selectedNodeIdsRef.value,
    data.connections,
    args.recursive
  )) {
    merged.add(id)
  }

  const mergedIds = [...merged]
  const primaryId =
    selectedNodeRef.value?.id && merged.has(selectedNodeRef.value.id)
      ? selectedNodeRef.value.id
      : (mergedIds[0] ?? null)

  active.setSelectedNodes(mergedIds, primaryId)
  setViewSelection(currentView.value.id, { nodeIds: mergedIds, primaryNodeId: primaryId })
}
