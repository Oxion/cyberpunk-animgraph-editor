/**
 * View model — visualization implementation (kind + typed payload).
 * Placement (body vs window) lives on the host surface, not on the entry.
 */

export type MainViewPayload = Record<string, never>

export type GraphScopeViewPayload = {
  scopeRootId: string
  stateMachineNodeId?: string
  hideScopeRoot?: boolean
}

export type StateLinksViewPayload = {
  stateNodeId: string
  stateMachineNodeId?: string
}

export type SmRingViewPayload = {
  stateMachineNodeId: string
}

/** Kind → payload. Extend this map to add view types. */
export interface GraphViewPayloadMap {
  main: MainViewPayload
  'graph-scope': GraphScopeViewPayload
  'state-links': StateLinksViewPayload
  'sm-ring': SmRingViewPayload
}

export type GraphViewKind = keyof GraphViewPayloadMap

export interface GraphViewChromeAction {
  id: string
  label: string
  title?: string
}

export interface GraphViewSelection {
  nodeIds: string[]
  primaryNodeId: string | null
}

/** One visualization instance (what to render). Host is the containing surface. */
export type GraphViewEntry<K extends GraphViewKind = GraphViewKind> = {
  [P in K]: {
    id: string
    kind: P
    /** Full title for host chrome */
    title: string
    /** Short breadcrumb segment */
    crumb: string
    /**
     * Which project diagram this view renders. Inherited on present from parent /
     * active context. Pinned for the life of the view (switch active does not rebind).
     */
    projectDiagramId: string
    /** Selection local to this view (does not leak to parent views). */
    selection?: GraphViewSelection
    payload: GraphViewPayloadMap[P]
  }
}[K]

export interface GraphViewBreadcrumbItem {
  index: number
  id: string
  crumb: string
  kind: GraphViewKind
}

/** Nested navigation entries for a stackable surface. */
export type DiagramStack = {
  entries: GraphViewEntry[]
}

export function isOverlayViewKind(kind: GraphViewKind): boolean {
  return kind !== 'main'
}

export function isGraphScopeEntry(entry: GraphViewEntry): entry is GraphViewEntry<'graph-scope'> {
  return entry.kind === 'graph-scope'
}

export function isStateLinksEntry(entry: GraphViewEntry): entry is GraphViewEntry<'state-links'> {
  return entry.kind === 'state-links'
}

export function isSmRingEntry(entry: GraphViewEntry): entry is GraphViewEntry<'sm-ring'> {
  return entry.kind === 'sm-ring'
}
