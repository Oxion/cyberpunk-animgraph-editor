import { snapshotNodesForClipboard } from '../utils/graph/pasteClipboard'
import { getActiveRenderData } from '../stores/graphProject'
import { selectedNodeIdsRef } from '../stores/graphSession'
import { nodeClipboard } from '../stores/nodeClipboard'

export function copySelection() {
  const data = getActiveRenderData()
  if (!data) return
  const snap = snapshotNodesForClipboard(data, selectedNodeIdsRef.value)
  if (!snap) return
  nodeClipboard.value = snap
}
