import { computed, ref } from 'vue'
import type {
  DiagramBodyView,
  FlatBodyView,
  OpenParallelBodyOptions,
  StackableBodyView,
} from '../types/DiagramBodyView'
import {
  bodyViewBreadcrumbs,
  bodyViewEntries,
  bodyViewRoot,
  bodyViewTop,
  isFlatBodyView,
  isStackableBodyView,
  isStackableViewKind,
} from '../types/DiagramBodyView'
import type { GraphViewBreadcrumbItem, GraphViewEntry, GraphViewSelection } from '../types/GraphView'
import { createMainGraphView } from '../utils/views/viewRegistry'

export const MAIN_BODY_ID = 'main'

let parallelSeq = 0

function ensureSelection(entry: GraphViewEntry): GraphViewEntry {
  return {
    ...entry,
    selection: entry.selection ?? { nodeIds: [], primaryNodeId: null },
  }
}

function cloneEntry(entry: GraphViewEntry): GraphViewEntry {
  return {
    ...entry,
    selection: entry.selection ? { ...entry.selection } : undefined,
  }
}

function createMainBodyView(projectDiagramId = 'main'): StackableBodyView {
  const root = createMainGraphView(projectDiagramId)
  return {
    id: projectDiagramId,
    surface: 'stackable',
    closable: false,
    preview: false,
    minimized: false,
    stack: { entries: [root] },
  }
}

/** Permanent non-closable body id equals project diagram id. */
export function isDiagramRootBodyId(id: string): boolean {
  const view = bodyViews.value.find((v) => v.id === id)
  return Boolean(view && !view.closable)
}

export function isDiagramRootBody(view: DiagramBodyView): boolean {
  return !view.closable
}

function pickPreferredBodyId(diagramIds: string[], preferActiveId?: string | null): string {
  const idSet = new Set(diagramIds)
  if (preferActiveId && idSet.has(preferActiveId)) return preferActiveId
  if (idSet.has(MAIN_BODY_ID)) return MAIN_BODY_ID
  return diagramIds[0] ?? MAIN_BODY_ID
}

/**
 * Soft sync: one non-closable body per project diagram (id = diagramId).
 * Reuses existing roots (keeps stacks). Preserves closable parallel bodies.
 */
export function syncProjectDiagramBodies(
  diagramIds: string[],
  preferActiveId?: string | null
) {
  const idSet = new Set(diagramIds)
  const closable = bodyViews.value.filter((v) => v.closable && !idSet.has(v.id))

  const roots: StackableBodyView[] = diagramIds.map((id) => {
    const existing = bodyViews.value.find((v) => v.id === id && !v.closable)
    if (existing && isStackableBodyView(existing)) {
      const root = bodyViewRoot(existing)
      if (root.kind === 'main' && root.projectDiagramId === id) {
        return existing
      }
    }
    return createMainBodyView(id)
  })

  bodyViews.value = roots.length > 0 ? [...roots, ...closable] : [createMainBodyView(), ...closable]

  if (diagramIds.length === 0) {
    activeBodyViewId.value = MAIN_BODY_ID
    return
  }

  activeBodyViewId.value = pickPreferredBodyId(diagramIds, preferActiveId)
}

/**
 * Hard replace: recreate all diagram-root bodies (fresh main stacks), drop parallels.
 * Use after Open / load project / close — never reuse stale lens stacks.
 */
export function replaceProjectDiagramBodies(
  diagramIds: string[],
  preferActiveId?: string | null
) {
  if (diagramIds.length === 0) {
    bodyViews.value = [createMainBodyView()]
    activeBodyViewId.value = MAIN_BODY_ID
    return
  }

  bodyViews.value = diagramIds.map((id) => createMainBodyView(id))
  activeBodyViewId.value = pickPreferredBodyId(diagramIds, preferActiveId)
}

/** @deprecated Prefer syncProjectDiagramBodies */
export function resetMainBodyToDiagram(projectDiagramId: string) {
  syncProjectDiagramBodies([projectDiagramId], projectDiagramId)
}

function createParallelBody(entry: GraphViewEntry, preview: boolean): DiagramBodyView {
  const rooted = ensureSelection(entry)
  if (isStackableViewKind(rooted.kind)) {
    const stackable: StackableBodyView = {
      id: rooted.id,
      surface: 'stackable',
      closable: true,
      preview,
      minimized: false,
      stack: { entries: [rooted] },
    }
    return stackable
  }
  const flat: FlatBodyView = {
    id: rooted.id,
    surface: 'flat',
    closable: true,
    preview,
    minimized: false,
    view: rooted,
  }
  return flat
}

function cloneBodyViews(views: DiagramBodyView[]): DiagramBodyView[] {
  return views.map((v) => {
    if (isStackableBodyView(v)) {
      return {
        ...v,
        stack: {
          entries: v.stack.entries.map(cloneEntry),
        },
      }
    }
    return {
      ...v,
      view: cloneEntry(v.view),
    }
  })
}

export const bodyViews = ref<DiagramBodyView[]>([createMainBodyView()])
/** Which body surface owns the main body area. */
export const activeBodyViewId = ref<string>(MAIN_BODY_ID)

export const mainBodyView = computed((): StackableBodyView => {
  const found = bodyViews.value.find((v) => v.id === MAIN_BODY_ID)
  if (found && isStackableBodyView(found)) return found
  return createMainBodyView()
})

export const activeBodyView = computed(() => {
  const id = activeBodyViewId.value
  const found = bodyViews.value.find((v) => v.id === id && !v.minimized)
  if (found) return found
  return mainBodyView.value
})

/** Top entry of the active body surface. */
export const currentView = computed(() => bodyViewTop(activeBodyView.value))

/** Closable parallel body views (lenses / previews) — not permanent diagram roots. */
export const parallelBodyViews = computed(() =>
  bodyViews.value.filter((v) => v.closable)
)

/** Permanent non-closable bodies (one per project diagram). */
export const diagramRootBodies = computed(() =>
  bodyViews.value.filter((v) => !v.closable)
)

export const activeParallelBodyView = computed(() => {
  const view = bodyViews.value.find((v) => v.id === activeBodyViewId.value)
  if (!view || view.minimized || !view.closable) return null
  return view
})

export const breadcrumbs = computed<GraphViewBreadcrumbItem[]>(() =>
  bodyViewBreadcrumbs(activeBodyView.value)
)

function findPreviewParallel(): DiagramBodyView | undefined {
  return (
    bodyViews.value.find((v) => v.closable && v.preview && !v.minimized) ??
    bodyViews.value.find((v) => v.closable && v.preview)
  )
}

function patchBodyView(id: string, patch: (view: DiagramBodyView) => void) {
  const next = cloneBodyViews(bodyViews.value)
  const view = next.find((v) => v.id === id)
  if (!view) return
  patch(view)
  bodyViews.value = next
}

function patchStackableBodyView(id: string, patch: (view: StackableBodyView) => void) {
  patchBodyView(id, (view) => {
    if (!isStackableBodyView(view)) return
    patch(view)
  })
}

/** Push onto a stackable body surface (defaults to active / Main). */
export const pushEntry = (entry: GraphViewEntry, stackId: string = activeBodyViewId.value) => {
  if (entry.kind === 'main') return
  const targetId = bodyViews.value.some((v) => v.id === stackId) ? stackId : MAIN_BODY_ID
  patchStackableBodyView(targetId, (view) => {
    view.stack.entries = [...view.stack.entries, ensureSelection(entry)]
    view.minimized = false
  })
  activeBodyViewId.value = targetId
}

/** @deprecated Prefer pushEntry — pushes onto active diagram-root stack. */
export const pushView = (entry: GraphViewEntry) => {
  const body = activeBodyView.value
  pushEntry(entry, isDiagramRootBody(body) ? body.id : MAIN_BODY_ID)
}

export const popEntry = (stackId: string = activeBodyViewId.value) => {
  const view = bodyViews.value.find((v) => v.id === stackId)
  if (!view || !isStackableBodyView(view) || view.stack.entries.length <= 1) {
    if (view?.closable) closeBodyView(stackId)
    return
  }
  patchStackableBodyView(stackId, (v) => {
    if (v.stack.entries.length <= 1) return
    v.stack.entries = v.stack.entries.slice(0, -1)
  })
}

export const popView = () => {
  const body = activeBodyView.value
  popEntry(isDiagramRootBody(body) ? body.id : MAIN_BODY_ID)
}

export const jumpToIndex = (index: number, stackId: string = activeBodyViewId.value) => {
  patchStackableBodyView(stackId, (v) => {
    if (index < 0 || index >= v.stack.entries.length) return
    v.stack.entries = v.stack.entries.slice(0, index + 1)
  })
}

export const resetToMain = () => {
  bodyViews.value = [createMainBodyView(MAIN_BODY_ID)]
  activeBodyViewId.value = MAIN_BODY_ID
}

export const openParallelBody = (view: GraphViewEntry, options: OpenParallelBodyOptions = {}) => {
  const preview = options.preview !== false
  const entry = ensureSelection(view)

  if (preview) {
    const existing = findPreviewParallel()
    if (existing) {
      const rooted = { ...entry, id: existing.id }
      const replacement = createParallelBody(rooted, true)
      replacement.id = existing.id
      bodyViews.value = bodyViews.value.map((v) => (v.id === existing.id ? replacement : v))
      activeBodyViewId.value = existing.id
      return existing.id
    }
  }

  parallelSeq += 1
  const id = `body_${entry.kind}_${parallelSeq}_${Date.now()}`
  const body = createParallelBody({ ...entry, id }, preview)
  bodyViews.value = [...bodyViews.value, body]
  activeBodyViewId.value = id
  return id
}

export const closeBodyView = (id: string) => {
  const view = bodyViews.value.find((v) => v.id === id)
  if (!view || !view.closable) return
  bodyViews.value = bodyViews.value.filter((v) => v.id !== id)
  if (activeBodyViewId.value === id) {
    const next =
      bodyViews.value.find((v) => v.closable && !v.minimized) ??
      bodyViews.value.find((v) => !v.closable) ??
      null
    activeBodyViewId.value = next?.id ?? MAIN_BODY_ID
  }
}

export const pinBodyView = (id: string) => {
  patchBodyView(id, (v) => {
    if (!v.preview) return
    v.preview = false
  })
}

export const activateBodyView = (id: string) => {
  const view = bodyViews.value.find((v) => v.id === id)
  if (!view) return
  const next = cloneBodyViews(bodyViews.value)
  const activatingRoot = !view.closable
  for (const v of next) {
    if (v.id === id) {
      v.minimized = false
    } else if (activatingRoot && v.closable) {
      v.minimized = true
    } else if (!activatingRoot && !v.closable) {
      // keep diagram roots present; taskbar uses activeBodyViewId
    }
  }
  bodyViews.value = next
  activeBodyViewId.value = id
}

export const minimizeBodyView = (id: string) => {
  const view = bodyViews.value.find((v) => v.id === id)
  if (!view) return
  if (!view.closable) {
    // Diagram roots stay open — switching away is activate another body.
    const fallback =
      bodyViews.value.find((v) => !v.closable && v.id !== id) ??
      bodyViews.value.find((v) => v.id === MAIN_BODY_ID)
    if (fallback) activeBodyViewId.value = fallback.id
    return
  }
  patchBodyView(id, (v) => {
    v.minimized = true
  })
  if (activeBodyViewId.value === id) {
    activeBodyViewId.value =
      bodyViews.value.find((v) => !v.closable)?.id ?? MAIN_BODY_ID
  }
}

export const toggleBodyView = (id: string) => {
  if (activeBodyViewId.value === id && bodyViews.value.find((v) => v.id === id)?.closable) {
    minimizeBodyView(id)
    return
  }
  activateBodyView(id)
}

export const clearParallelBodyViews = () => {
  bodyViews.value = bodyViews.value.filter((v) => !v.closable)
  if (!bodyViews.value.some((v) => v.id === activeBodyViewId.value)) {
    activeBodyViewId.value = bodyViews.value.find((v) => !v.closable)?.id ?? MAIN_BODY_ID
  }
}

export const setViewSelection = (viewId: string, selection: GraphViewSelection) => {
  const next = cloneBodyViews(bodyViews.value)
  for (const body of next) {
    if (isStackableBodyView(body)) {
      body.stack.entries = body.stack.entries.map((entry) =>
        entry.id === viewId ? { ...entry, selection: { ...selection } } : entry
      )
    } else if (isFlatBodyView(body) && body.view.id === viewId) {
      body.view = { ...body.view, selection: { ...selection } }
    }
  }
  bodyViews.value = next
}

export const getViewSelection = (viewId: string): GraphViewSelection => {
  for (const body of bodyViews.value) {
    for (const entry of bodyViewEntries(body)) {
      if (entry.id === viewId) {
        return entry.selection ?? { nodeIds: [], primaryNodeId: null }
      }
    }
  }
  return { nodeIds: [], primaryNodeId: null }
}

/** Closable / root body belongs to a project diagram. */
export function bodyBelongsToDiagram(view: DiagramBodyView, diagramId: string): boolean {
  if (!view.closable) return view.id === diagramId
  const root = bodyViewRoot(view)
  const top = bodyViewTop(view)
  return root.projectDiagramId === diagramId || top.projectDiagramId === diagramId
}

/** Legacy ref-like access to active diagram-root stack entries. */
export const graphViewStackRef = computed(() => {
  const body = activeBodyView.value
  if (isDiagramRootBody(body) && isStackableBodyView(body)) {
    return body.stack.entries
  }
  return mainBodyView.value.stack.entries
})

export { bodyViewRoot }
