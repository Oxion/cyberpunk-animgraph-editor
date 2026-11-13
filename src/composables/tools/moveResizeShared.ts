import { type Ref } from 'vue'
import type { RenderNode } from '../../utils/graph/diagramTypes'
import { lastPointerClient } from '../../stores/modalGestureUi'

/** Slim host — pointer/move flags live in modalGestureUi. */
export type MoveResizeHost = {
  graphCanvas: Ref<HTMLDivElement | null>
  updateGraphInteractionGate: () => void
}

let host: MoveResizeHost | null = null

export function requireHost(): MoveResizeHost {
  if (!host) throw new Error('bindMoveResizeSession() must be called first')
  return host
}

export const getNodeWidth = (node: RenderNode): number => node.size?.width ?? 40
export const getNodeHeight = (node: RenderNode): number => node.size?.height ?? 30

export const trackLastPointerClient = (event: PointerEvent) => {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
}

export function bindMoveResizeSession(next: MoveResizeHost) {
  host = next
}
