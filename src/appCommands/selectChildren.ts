import { commandEnabled } from '../stores/appContext'
import { currentView, setViewSelection } from '../stores/bodyViews'
import { getActiveDiagramRenderer } from '../stores/diagramRenderers'
import { getActiveRenderData } from '../stores/graphProject'
import { selectedNodeIdsRef, selectedNodeRef } from '../stores/graphSession'
import { getChildSlot } from '../utils/graph/nodeChildSlots'

export function selectChildren() {
  if (!commandEnabled('selection.selectChildren')) return

  const active = getActiveDiagramRenderer()
  const data = getActiveRenderData()
  if (!data || !active || selectedNodeIdsRef.value.length === 0) return

  const merged = new Set(selectedNodeIdsRef.value)
  let added = false
  for (const id of selectedNodeIdsRef.value) {
    const node = data.allNodes.get(id)
    if (!node) continue
    for (const child of getChildSlot(node)) {
      if (!merged.has(child.id)) {
        merged.add(child.id)
        added = true
      }
    }
  }
  if (!added) return

  const mergedIds = [...merged]
  const primaryId =
    selectedNodeRef.value?.id && merged.has(selectedNodeRef.value.id)
      ? selectedNodeRef.value.id
      : (mergedIds[0] ?? null)

  active.setSelectedNodes(mergedIds, primaryId)
  setViewSelection(currentView.value.id, { nodeIds: mergedIds, primaryNodeId: primaryId })
}
