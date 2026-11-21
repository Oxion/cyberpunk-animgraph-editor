import { computed, watch } from 'vue'
import { bodyContentIds } from './bodyContent'
import { graphViews, unregisterGraphViews } from './graphViewRegistry'
import { windowStacks } from './windowStacks'

const bodyHostedIds = computed(() => {
  const ids = new Set<string>()
  for (const entries of Object.values(bodyContentIds.value)) {
    for (const id of entries) ids.add(id)
  }
  return ids
})

const windowHostedIds = computed(() => {
  const ids = new Set<string>()
  for (const entries of Object.values(windowStacks.value)) {
    for (const id of entries) ids.add(id)
  }
  return ids
})

function isHosted(id: string): boolean {
  return bodyHostedIds.value.has(id) || windowHostedIds.value.has(id)
}

function reconcileGraphViews() {
  unregisterGraphViews(Object.keys(graphViews.value).filter((id) => !isHosted(id)))
}

/** Start orphan GC — call once from app bootstrap. */
export function startGraphViewGc() {
  watch(bodyHostedIds, reconcileGraphViews, { flush: 'sync' })
  watch(windowHostedIds, reconcileGraphViews, { flush: 'sync' })
}
