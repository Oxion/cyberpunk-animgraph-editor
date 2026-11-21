import { computed } from 'vue'
import type { DiagramBodyView, OpenParallelBodyOptions } from '../types/DiagramBodyView'
import { isStackableBodyView, isStackableViewKind } from '../types/DiagramBodyView'
import type { GraphViewBreadcrumbItem, GraphViewEntry, GraphViewSelection } from '../types/GraphView'
import {
  bodyContentRoot,
  bodyContentTop,
  getBodyContentIds,
  setBodyContentIds,
} from './bodyContent'
import {
  activateBodyContentHost,
  activeBodyView,
  activeBodyViewId,
  bodyViews,
  closeBodyView,
  firstNonClosableId,
  isDiagramRootBody,
  openParallelBody,
} from './bodyViews'
import {
  getGraphView,
  resolveGraphViews,
  updateGraphView,
} from './graphViewRegistry'

/** Top entry of the active body surface. */
export const currentView = computed((): GraphViewEntry | null => {
  const body = activeBodyView.value
  if (!body) return null
  const topId = bodyContentTop(body.id)
  return topId ? getGraphView(topId) ?? null : null
})

/** Active diagram-root stack entries (legacy). */
export const graphViewStackRef = computed((): GraphViewEntry[] => {
  const body = activeBodyView.value
  if (body && isDiagramRootBody(body) && isStackableBodyView(body)) {
    return resolveGraphViews(getBodyContentIds(body.id))
  }
  const root = bodyViews.value.find((v) => !v.closable && isStackableBodyView(v))
  return root ? resolveGraphViews(getBodyContentIds(root.id)) : []
})

const emptySelection = (): GraphViewSelection => ({
  nodeIds: [],
  primaryNodeId: null,
})

export function setViewSelection(viewId: string, selection: GraphViewSelection) {
  updateGraphView(viewId, (entry) => ({
    ...entry,
    selection: { ...selection },
  }))
}

export function getViewSelection(viewId: string): GraphViewSelection {
  return getGraphView(viewId)?.selection ?? emptySelection()
}

/** Closable / root body belongs to a project diagram. */
export function bodyBelongsToDiagram(view: DiagramBodyView, diagramId: string): boolean {
  if (!view.closable) return view.id === diagramId
  const root = getGraphView(bodyContentRoot(view.id) ?? '')
  const top = getGraphView(bodyContentTop(view.id) ?? '')
  return root?.projectDiagramId === diagramId || top?.projectDiagramId === diagramId
}

export function resolveBodyViewEntries(body: DiagramBodyView): GraphViewEntry[] {
  return resolveGraphViews(getBodyContentIds(body.id))
}

export function resolveBodyViewTop(body: DiagramBodyView): GraphViewEntry | null {
  const topId = bodyContentTop(body.id)
  return topId ? getGraphView(topId) ?? null : null
}

export function resolveBodyViewRoot(body: DiagramBodyView): GraphViewEntry | null {
  const rootId = bodyContentRoot(body.id)
  return rootId ? getGraphView(rootId) ?? null : null
}

export function bodyViewBreadcrumbs(body: DiagramBodyView): GraphViewBreadcrumbItem[] {
  return resolveBodyViewEntries(body).map((entry, index) => ({
    index,
    id: entry.id,
    crumb: entry.crumb,
    kind: entry.kind,
  }))
}

/** Push a registered view id onto a stackable body (defaults to active). */
export function pushEntry(entryId: string, stackId: string = activeBodyViewId.value) {
  const targetId = bodyViews.value.some((v) => v.id === stackId)
    ? stackId
    : firstNonClosableId()
  if (!targetId) return
  setBodyContentIds(targetId, [...getBodyContentIds(targetId), entryId])
  activateBodyContentHost(targetId)
}

/** @deprecated Prefer pushEntry — pushes onto active diagram-root stack. */
export function pushView(entryId: string) {
  const body = activeBodyView.value
  pushEntry(entryId, body && isDiagramRootBody(body) ? body.id : firstNonClosableId() ?? '')
}

export function popEntry(stackId: string = activeBodyViewId.value) {
  const body = bodyViews.value.find((v) => v.id === stackId)
  const ids = getBodyContentIds(stackId)
  if (!body || ids.length <= 1) {
    if (body?.closable) closeBodyView(stackId)
    return
  }
  setBodyContentIds(stackId, ids.slice(0, -1))
}

export function popView() {
  const body = activeBodyView.value
  popEntry(body && isDiagramRootBody(body) ? body.id : firstNonClosableId() ?? '')
}

export function jumpToIndex(index: number, stackId: string = activeBodyViewId.value) {
  const ids = getBodyContentIds(stackId)
  if (index < 0 || index >= ids.length) return
  setBodyContentIds(stackId, ids.slice(0, index + 1))
}

/** Open parallel body chrome and assign registered content ids. */
export function openParallelGraphBody(
  contentIds: string[],
  options: Omit<OpenParallelBodyOptions, 'surface'> & { surface?: OpenParallelBodyOptions['surface'] } = {}
) {
  const first = contentIds[0]
  const surface =
    options.surface ??
    (first && getGraphView(first)
      ? isStackableViewKind(getGraphView(first)!.kind)
        ? 'stackable'
        : 'flat'
      : 'stackable')
  const bodyId = openParallelBody({
    preview: options.preview,
    surface,
  })
  setBodyContentIds(bodyId, contentIds)
  return bodyId
}
