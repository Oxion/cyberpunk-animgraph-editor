import type { AppCommandArgs } from '../../../core/commands/types'
import { currentView, setViewSelection } from '../../../stores/bodyViews'
import { getActiveDiagramRenderer } from '../../../stores/diagramRenderers'
import { getActiveRenderData } from '../../../stores/graphProject'
import { selectedNodeIdsRef, selectedNodeRef } from '../../../stores/graphSession'
import { Commands } from '../ids'
import { collectInputNodeIds } from '../../../utils/graph/diagramUtils'

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
