import { readonly, ref } from 'vue'
import type { GraphViewEntry } from '../types/GraphView'

const views = ref<Record<string, GraphViewEntry>>({})

/** Readonly registry map — mutate only via register/unregister/update. */
export const graphViews = readonly(views)

export function registerGraphView(entry: GraphViewEntry) {
  views.value = { ...views.value, [entry.id]: entry }
}

export function registerGraphViews(entries: GraphViewEntry[]) {
  if (entries.length === 0) return
  const next = { ...views.value }
  for (const entry of entries) next[entry.id] = entry
  views.value = next
}

export function unregisterGraphView(id: string) {
  if (!(id in views.value)) return
  const next = { ...views.value }
  delete next[id]
  views.value = next
}

export function unregisterGraphViews(ids: string[]) {
  if (ids.length === 0) return
  const next = { ...views.value }
  let changed = false
  for (const id of ids) {
    if (!(id in next)) continue
    delete next[id]
    changed = true
  }
  if (changed) views.value = next
}

export function getGraphView(id: string): GraphViewEntry | undefined {
  return views.value[id]
}

export function resolveGraphViews(ids: string[]): GraphViewEntry[] {
  const out: GraphViewEntry[] = []
  for (const id of ids) {
    const entry = views.value[id]
    if (entry) out.push(entry)
  }
  return out
}

export function updateGraphView(
  id: string,
  update: (entry: GraphViewEntry) => GraphViewEntry
) {
  const prev = views.value[id]
  if (!prev) return
  const next = update(prev)
  views.value = { ...views.value, [id]: next }
}
