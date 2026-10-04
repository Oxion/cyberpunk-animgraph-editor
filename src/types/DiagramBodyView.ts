import type { DiagramStack, GraphViewEntry, GraphViewKind } from './GraphView'

/**
 * Body surface shapes. Extend this map to add surface variants.
 * Placement is implied: these always live in the main body / taskbar.
 */
export interface DiagramBodySurfaceMap {
  stackable: {
    closable: boolean
    preview: boolean
    minimized: boolean
    stack: DiagramStack
  }
  flat: {
    closable: boolean
    preview: boolean
    minimized: boolean
    view: GraphViewEntry
  }
}

export type DiagramBodySurface = keyof DiagramBodySurfaceMap

/** Body surface shown in the main body area / taskbar. */
export type DiagramBodyView = {
  [K in DiagramBodySurface]: {
    id: string
    surface: K
  } & DiagramBodySurfaceMap[K]
}[DiagramBodySurface]

export type StackableBodyView = Extract<DiagramBodyView, { surface: 'stackable' }>
export type FlatBodyView = Extract<DiagramBodyView, { surface: 'flat' }>

export type OpenParallelBodyOptions = {
  preview?: boolean
}

/** View kinds that should open as a stackable body surface. */
export const STACKABLE_VIEW_KINDS: ReadonlySet<GraphViewKind> = new Set([
  'main',
  'graph-scope',
  'state-links',
])

export function isStackableViewKind(kind: GraphViewKind): boolean {
  return STACKABLE_VIEW_KINDS.has(kind)
}

export function isStackableBodyView(view: DiagramBodyView): view is StackableBodyView {
  return view.surface === 'stackable'
}

export function isFlatBodyView(view: DiagramBodyView): view is FlatBodyView {
  return view.surface === 'flat'
}

export function bodyViewRoot(view: DiagramBodyView): GraphViewEntry {
  return isStackableBodyView(view) ? view.stack.entries[0]! : view.view
}

export function bodyViewTop(view: DiagramBodyView): GraphViewEntry {
  if (isStackableBodyView(view)) {
    return view.stack.entries[view.stack.entries.length - 1]!
  }
  return view.view
}

export function bodyViewEntries(view: DiagramBodyView): GraphViewEntry[] {
  return isStackableBodyView(view) ? view.stack.entries : [view.view]
}

/** Stack layers above `main` (lenses / state-links / sm-ring). */
export function bodyOverlayEntries(view: DiagramBodyView): GraphViewEntry[] {
  return bodyViewEntries(view).filter((entry) => entry.kind !== 'main')
}

export function bodyViewBreadcrumbs(view: DiagramBodyView) {
  return bodyViewEntries(view).map((entry, index) => ({
    index,
    id: entry.id,
    crumb: entry.crumb,
    kind: entry.kind,
  }))
}
