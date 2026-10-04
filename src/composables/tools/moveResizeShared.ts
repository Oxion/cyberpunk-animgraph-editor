import { type Ref } from 'vue'
import type { RenderNode } from '../../utils/graph/diagramTypes'
import {
  clearModalGestureRestoreState,
  lastPointerClient,
  modalGestureReplacedFocus,
  modalPointerListeners,
  suppressModalGestureRestore,
  toolBeforeModalGesture,
} from '../../stores/modalGestureUi'
import { toolManager } from '../../stores/toolManager'
import { moveToolState, resizeToolState } from '../../stores/tools'
import type { AppToolId } from '../../appTools/catalog'

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

type GrabModalApi = {
  updateFromClient: (clientX: number, clientY: number) => void
  confirm: () => void
  cancel: () => void
}

type ResizeModalApi = {
  scheduleFromClient: (clientX: number, clientY: number) => void
  confirm: () => void
  cancel: () => void
}

let grabModalApi: GrabModalApi | null = null
let resizeModalApi: ResizeModalApi | null = null

export function registerGrabModalApi(api: GrabModalApi) {
  grabModalApi = api
}

export function registerResizeModalApi(api: ResizeModalApi) {
  resizeModalApi = api
}

export const detachModalPointerListeners = () => {
  if (!modalPointerListeners.attached) return
  document.removeEventListener('pointermove', onModalPointerMove, true)
  document.removeEventListener('pointerdown', onModalPointerDown, true)
  document.removeEventListener('contextmenu', onModalContextMenu, true)
  modalPointerListeners.attached = false
}

export const attachModalPointerListeners = () => {
  if (modalPointerListeners.attached) return
  document.addEventListener('pointermove', onModalPointerMove, true)
  document.addEventListener('pointerdown', onModalPointerDown, true)
  document.addEventListener('contextmenu', onModalContextMenu, true)
  modalPointerListeners.attached = true
}

export const onModalPointerMove = (event: PointerEvent) => {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
  if (moveToolState.session) {
    grabModalApi?.updateFromClient(event.clientX, event.clientY)
    return
  }
  if (resizeToolState.session) {
    resizeModalApi?.scheduleFromClient(event.clientX, event.clientY)
  }
}

export const onModalPointerDown = (event: PointerEvent) => {
  if (!moveToolState.session && !resizeToolState.session) return
  if (event.button === 0) {
    event.preventDefault()
    event.stopPropagation()
    if (moveToolState.session) grabModalApi?.confirm()
    else resizeModalApi?.confirm()
    return
  }
  if (event.button === 2) {
    event.preventDefault()
    event.stopPropagation()
    if (moveToolState.session) grabModalApi?.cancel()
    else resizeModalApi?.cancel()
  }
}

export const onModalContextMenu = (event: Event) => {
  if (!moveToolState.session && !resizeToolState.session) return
  event.preventDefault()
  event.stopPropagation()
}

export const trackLastPointerClient = (event: PointerEvent) => {
  lastPointerClient.x = event.clientX
  lastPointerClient.y = event.clientY
}

export const restoreToolAfterModalGesture = () => {
  if (suppressModalGestureRestore.value || !modalGestureReplacedFocus.value) return
  const prior = toolBeforeModalGesture.value as AppToolId | null
  clearModalGestureRestoreState()
  if (prior) {
    queueMicrotask(() => {
      toolManager.activateTool(prior)
      toolManager.focusTool(prior)
    })
  }
}

export function bindMoveResizeSession(next: MoveResizeHost) {
  host = next
}
