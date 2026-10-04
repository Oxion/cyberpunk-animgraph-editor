import { reactive } from 'vue'

export type ResizeSideLock = 'none' | 'left' | 'right' | 'top' | 'bottom'

export type ResizeStartLayout = {
  x: number
  y: number
  width: number
  height: number
}

export type ResizeNeighbourContact = {
  id: string
}

export type ResizeAncestorPlan = {
  parentId: string
  linkChildIds: string[]
  childIds: string[]
  right: ResizeNeighbourContact[]
  left: ResizeNeighbourContact[]
  below: ResizeNeighbourContact[]
  above: ResizeNeighbourContact[]
  depth: number
}

export type ResizeSession = {
  diagramId: string
  startWorld: { x: number; y: number }
  sideLock: ResizeSideLock
  startLayouts: Map<string, ResizeStartLayout>
  cascadeStartLayouts: Map<string, ResizeStartLayout>
  cascadePlan: ResizeAncestorPlan[]
}

export const resizeToolState = reactive({
  session: null as ResizeSession | null,
})

/** Only derived field: session present. */
export const resizeToolCache = reactive({
  active: false,
})
