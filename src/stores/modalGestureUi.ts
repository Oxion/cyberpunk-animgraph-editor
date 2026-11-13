import { ref } from 'vue'

/** Pointer / modal-gesture prefs shared by move & resize sessions. */

export const lastPointerClient = {
  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
}

export const moveStep = ref(10)
export const moveDescendants = ref(true)
export const moveOutputs = ref(false)
export const moveInputs = ref(false)
export const autoResizeParents = ref(true)
/** Unused by move/resize (neighbour push off); kept for legacy accordion fragment. */
export const moveSiblings = ref(false)
