import { computed, ref } from 'vue'
import type { GraphViewEntry } from '../types/GraphView'
import { createGraphScopeView, createStateLinksView } from '../utils/views/viewRegistry'

/**
 * Per-window DiagramStack for stackable window hosts (state-links, lens).
 * Push stays inside the window — host is the window, not the entry.
 */
const windowStacks = ref<Record<string, GraphViewEntry[]>>({})

export function initStateLinksWindowStack(
  windowId: string,
  opts: {
    stateNodeId: string
    label: string
    stateMachineNodeId?: string
    projectDiagramId: string
  }
) {
  const root = createStateLinksView({
    stateNodeId: opts.stateNodeId,
    label: opts.label,
    stateMachineNodeId: opts.stateMachineNodeId,
    projectDiagramId: opts.projectDiagramId,
  })
  root.id = `${windowId}__root`
  windowStacks.value = { ...windowStacks.value, [windowId]: [root] }
}

export function initLensWindowStack(
  windowId: string,
  opts: {
    scopeRootId: string
    label: string
    hideScopeRoot?: boolean
    stateMachineNodeId?: string
    projectDiagramId: string
  }
) {
  const root = createGraphScopeView({
    scopeRootId: opts.scopeRootId,
    label: opts.label,
    hideScopeRoot: opts.hideScopeRoot,
    stateMachineNodeId: opts.stateMachineNodeId,
    projectDiagramId: opts.projectDiagramId,
  })
  root.id = `${windowId}__root`
  windowStacks.value = { ...windowStacks.value, [windowId]: [root] }
}

export function clearWindowStack(windowId: string) {
  if (!(windowId in windowStacks.value)) return
  const next = { ...windowStacks.value }
  delete next[windowId]
  windowStacks.value = next
}

export function getWindowStack(windowId: string): GraphViewEntry[] {
  return windowStacks.value[windowId] ?? []
}

export function getWindowStackTop(windowId: string): GraphViewEntry | null {
  const stack = windowStacks.value[windowId]
  if (!stack || stack.length === 0) return null
  return stack[stack.length - 1]!
}

export function pushWindowStack(windowId: string, entry: GraphViewEntry) {
  const prev = windowStacks.value[windowId]
  if (!prev || prev.length === 0) return
  // Namespace so body renderer sync can treat win_* ids as window-owned.
  const id = entry.id.startsWith(`${windowId}__`) ? entry.id : `${windowId}__${entry.id}`
  windowStacks.value = {
    ...windowStacks.value,
    [windowId]: [...prev, { ...entry, id }],
  }
}

/** View id registered for the focused layer of a window (stack top). */
export function getWindowTopViewId(windowId: string): string | null {
  return getWindowStackTop(windowId)?.id ?? null
}

export function forEachWindowStackEntry(
  fn: (windowId: string, entry: GraphViewEntry) => void
): void {
  for (const [windowId, stack] of Object.entries(windowStacks.value)) {
    for (const entry of stack) fn(windowId, entry)
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
    .map(([id, entries]) => `${id}:${entries.map((e) => e.id).join('|')}`)
    .join(';')
)
