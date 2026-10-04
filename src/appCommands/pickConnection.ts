import { selectedNodeRef } from '../stores/graphSession'
import { pickCreateConnectionFrom, pickCreateConnectionTo } from '../stores/tools/createConnection'

export function pickConnectionFrom() {
  const id = selectedNodeRef.value?.id
  if (id) pickCreateConnectionFrom(id)
}

export function pickConnectionTo() {
  const id = selectedNodeRef.value?.id
  if (id) pickCreateConnectionTo(id)
}
