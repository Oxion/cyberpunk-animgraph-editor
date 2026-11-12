import { getActiveDiagramRenderer } from '../../../stores/diagramRenderers'
import { handleNodeSelect } from '../../../composables/useGraphNavigation'

export function deselectAll() {
  handleNodeSelect(null, [])
  getActiveDiagramRenderer()?.setSelectedNodes([], null, true)
}
