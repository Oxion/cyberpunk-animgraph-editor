import { getActiveDiagramRenderer } from '../stores/diagramRenderers'

export function cancelConnectionDrag() {
  getActiveDiagramRenderer()?.abortPinDrag()
}
