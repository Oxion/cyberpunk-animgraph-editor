import { deleteActiveSelectedNode } from '../stores/graphMutations'

export function deleteSelection() {
  const result = deleteActiveSelectedNode()
  if (!result.ok && result.message) alert(result.message)
}
