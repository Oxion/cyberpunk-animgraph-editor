import { reactive } from 'vue'

export const createConnectionToolState = reactive({
  fromId: '',
  toId: '',
  /** False: To field follows the current selection. */
  toSpecified: false,
  /** Empty string = None (diagram-only). */
  pinName: '',
})

export const createConnectionToolCache = reactive({
  hasSelection: false,
})

export function pickCreateConnectionFrom(nodeId: string): void {
  const id = nodeId.trim()
  if (!id) return
  createConnectionToolState.fromId = id
}

export function pickCreateConnectionTo(nodeId: string): void {
  const id = nodeId.trim()
  if (!id) return
  createConnectionToolState.toSpecified = true
  createConnectionToolState.toId = id
}
