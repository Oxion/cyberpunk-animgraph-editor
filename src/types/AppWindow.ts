export type AppWindowType = 'lens' | 'sm-ring' | 'state-links' | 'settings' | 'render-stats'

export interface LensWindowPayload {
  rootNodeId: string
  rootLabel: string
  /** Project diagram this window renders. */
  projectDiagramId: string
  /** Opened via Ctrl+Alt on main graph; closed when selection changes. */
  quickLens?: boolean
  /** When true, paint children of root as top-level (subview). */
  hideScopeRoot?: boolean
}

export interface SmRingWindowPayload {
  stateMachineNodeId: string
  rootLabel: string
  projectDiagramId: string
}

export interface StateLinksWindowPayload {
  stateNodeId: string
  rootLabel: string
  projectDiagramId: string
  stateMachineNodeId?: string
}

export interface RenderStatsWindowPayload {
  /** Where the PixiGraphRenderer lives. */
  source: 'main' | 'body' | 'window'
  /** `main` | body view id | app window id */
  sourceId: string
  label: string
}

export interface AppWindowRect {
  x?: number
  y?: number
  width?: number
  height?: number
}

export type AppWindowOpenOptions = {
  /** VS Code-like preview: next preview of same type replaces this window. */
  preview?: boolean
  /** Fill the whole app-windows layer. */
  maximized?: boolean
  offsetIndex?: number
  /** Override present-ops preferred width (e.g. measured column). */
  preferredWidth?: number
}

type AppWindowBase = {
  id: string
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minimized: boolean
  /** Temporary preview slot — replaced by the next preview of the same type. */
  preview: boolean
  maximized: boolean
  /** Geometry to restore after un-maximize. */
  restoreRect?: { x: number; y: number; width: number; height: number }
  /** Grow height to content until the user resizes/moves the window. */
  autoSizePending?: boolean
}

export type AppWindowState =
  | (AppWindowBase & {
      type: 'lens'
      payload: LensWindowPayload
    })
  | (AppWindowBase & {
      type: 'sm-ring'
      payload: SmRingWindowPayload
    })
  | (AppWindowBase & {
      type: 'state-links'
      payload: StateLinksWindowPayload
    })
  | (AppWindowBase & {
      type: 'settings'
      payload: Record<string, never>
    })
  | (AppWindowBase & {
      type: 'render-stats'
      payload: RenderStatsWindowPayload
    })
