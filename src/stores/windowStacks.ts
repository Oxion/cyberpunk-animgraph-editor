import { computed, ref } from 'vue'

/**
 * Per-window stack of graph-view ids (state-links, lens).
 * Entries live in graphViewRegistry; host is the window.
 */
export const windowStacks = ref<Record<string, string[]>>({})

export function setWindowStack(windowId: string, entryIds: string[]) {
  windowStacks.value = { ...windowStacks.value, [windowId]: [...entryIds] }
}

export function clearWindowStack(windowId: string) {
  if (!(windowId in windowStacks.value)) return
  const next = { ...windowStacks.value }
  delete next[windowId]
  windowStacks.value = next
}

export function getWindowStack(windowId: string): string[] {
  return windowStacks.value[windowId] ?? []
}

export function getWindowStackTop(windowId: string): string | null {
  const stack = windowStacks.value[windowId]
  if (!stack || stack.length === 0) return null
  return stack[stack.length - 1]!
}

/** Push a registered view id onto a window stack. */
export function pushWindowStack(windowId: string, entryId: string) {
  const prev = windowStacks.value[windowId]
  if (!prev || prev.length === 0) return
  windowStacks.value = {
    ...windowStacks.value,
    [windowId]: [...prev, entryId],
  }
}

/** View id registered for the focused layer of a window (stack top). */
export function getWindowTopViewId(windowId: string): string | null {
  return getWindowStackTop(windowId)
}

export function forEachWindowStackEntry(
  fn: (windowId: string, entryId: string) => void
): void {
  for (const [windowId, stack] of Object.entries(windowStacks.value)) {
    for (const entryId of stack) fn(windowId, entryId)
  }
}

export function popWindowStack(windowId: string) {
  const prev = windowStacks.value[windowId]
  if (!prev || prev.length <= 1) return
  windowStacks.value = {
    ...windowStacks.value,
    [windowId]: prev.slice(0, -1),
  }
}

export function jumpWindowStack(windowId: string, index: number) {
  const prev = windowStacks.value[windowId]
  if (!prev || index < 0 || index >= prev.length) return
  windowStacks.value = {
    ...windowStacks.value,
    [windowId]: prev.slice(0, index + 1),
  }
}

export const windowStackRevision = computed(() =>
  Object.entries(windowStacks.value)
    .map(([id, entries]) => `${id}:${entries.join('|')}`)
    .join(';')
)
