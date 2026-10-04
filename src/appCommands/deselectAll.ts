import { commandEnabled } from '../stores/appContext'
import { getActiveDiagramRenderer } from '../stores/diagramRenderers'
import { handleNodeSelect } from '../composables/useGraphNavigation'

export function deselectAll() {
  if (!commandEnabled('selection.deselectAll')) return
  handleNodeSelect(null, [])
  getActiveDiagramRenderer()?.setSelectedNodes([], null, true)
}
