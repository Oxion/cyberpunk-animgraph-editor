import type { ResizeAncestorPlan, ResizeStartLayout } from './resize'

export type GrabAxisLock = 'none' | 'x' | 'y'

export type GrabMoveSession = {
  diagramId: string
  startWorld: { x: number; y: number }
  appliedDelta: { x: number; y: number }
  /** Arrow-key nudges accumulated during grab (kept separate from mouse delta). */
  keyboardOffset: { x: number; y: number }
  axisLock: GrabAxisLock
  /** Snapshot of autoResizeParents at begin — grow parents only, no neighbour push. */
  growParents: boolean
  seedStartLayouts: Map<string, ResizeStartLayout>
  /** Inputs/outputs dragged with the selection (same delta). */
  satelliteStartLayouts: Map<string, ResizeStartLayout>
  cascadeStartLayouts: Map<string, ResizeStartLayout>
  cascadePlan: ResizeAncestorPlan[]
}
