import { deleteActiveSelectedNode } from '../stores/graphMutations'
import { commandEnabled } from '../stores/appContext'

export function deleteSelection() {
  if (!commandEnabled('selection.delete')) return
  const result = deleteActiveSelectedNode()
  if (!result.ok && result.message) alert(result.message)
}
