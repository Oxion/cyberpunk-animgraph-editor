import { readonly, ref, watch } from 'vue'
import { bodyViews } from './bodyViews'

/**
 * Hosted content ids per body surface id.
 * Parallel to bodyViews chrome — bodies do not embed content.
 */
const contentByBodyId = ref<Record<string, string[]>>({})

/** Readonly map for readers / GC. */
export const bodyContentIds = readonly(contentByBodyId)

export function getBodyContentIds(bodyId: string): string[] {
  return contentByBodyId.value[bodyId] ?? []
}

export function setBodyContentIds(bodyId: string, ids: string[]) {
  contentByBodyId.value = {
    ...contentByBodyId.value,
    [bodyId]: [...ids],
  }
}

export function clearBodyContent(bodyId: string) {
  if (!(bodyId in contentByBodyId.value)) return
  const next = { ...contentByBodyId.value }
  delete next[bodyId]
  contentByBodyId.value = next
}

export function bodyContentRoot(bodyId: string): string | undefined {
  return getBodyContentIds(bodyId)[0]
}

export function bodyContentTop(bodyId: string): string | undefined {
  const ids = getBodyContentIds(bodyId)
  return ids[ids.length - 1]
}

/** Drop content for bodies that no longer exist. */
function pruneOrphanBodyContent() {
  const live = new Set(bodyViews.value.map((b) => b.id))
  const next = { ...contentByBodyId.value }
  let changed = false
  for (const bodyId of Object.keys(next)) {
    if (live.has(bodyId)) continue
    delete next[bodyId]
    changed = true
  }
  if (changed) contentByBodyId.value = next
}

watch(bodyViews, pruneOrphanBodyContent, { flush: 'sync' })