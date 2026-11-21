import type { GraphViewKind } from './GraphView'

/**
 * Body surface chrome only. Hosted content ids live in bodyContent (parallel map).
 */
export interface DiagramBodySurfaceMap {
  stackable: {
    closable: boolean
    preview: boolean
    minimized: boolean
  }
  flat: {
    closable: boolean
    preview: boolean
    minimized: boolean
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
  surface: DiagramBodySurface
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
