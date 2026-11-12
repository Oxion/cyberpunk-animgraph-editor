import type { AppToolId } from '../appTools/catalog'
import { ref, type Ref } from 'vue'
import { focusedTool, toolManager } from './toolManager'

/** Pointer / modal-gesture UI state shared by move & resize sessions. */

export const lastPointerClient = {
  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
}
export const modalPointerListeners = { attached: false }
export const suppressModalGestureRestore = { value: false }
export const pressedArrowKeys = new Set<string>()

export const moveStep = ref(10)
export const moveDescendants = ref(true)
export const moveOutputs = ref(false)
export const moveInputs = ref(false)
export const autoResizeParents = ref(true)
/** Unused by move/resize (neighbour push off); kept for legacy accordion fragment. */
export const moveSiblings = ref(false)

export const modalGestureReplacedFocus = ref(false)
/**
 * Prior focused tool before G/S modal gesture.
 * Stored as string tool id (AppToolId) without forcing MoveResizeHost to import UI types.
 */
export const toolBeforeModalGesture = ref<string | null>(null)

export function clearModalGestureRestoreState() {
  toolBeforeModalGesture.value = null
  modalGestureReplacedFocus.value = false
}

/** Enter move/resize from hotkey/panel Start: remember prior focused for restore. */
export function beginModalGestureTool(gestureTool: 'move' | 'resize') {
  if (!modalGestureReplacedFocus.value) {
    const prior = focusedTool.value
    if (prior && prior !== 'move' && prior !== 'resize') {
      toolBeforeModalGesture.value = prior
      modalGestureReplacedFocus.value = true
      toolManager.deactivateTool(prior)
    } else if (prior == null) {
      toolBeforeModalGesture.value = null
      modalGestureReplacedFocus.value = true
    } else {
      // Already on move/resize from menu — keep that tool after session ends.
      clearModalGestureRestoreState()
    }
  }
  toolManager.activateTool(gestureTool)
  toolManager.focusTool(gestureTool)
}