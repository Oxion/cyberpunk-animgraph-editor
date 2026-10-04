import { reactive } from 'vue'

export const pasteNodeToolState = reactive({
  targetSpecified: false,
  targetNodeId: '',
})

export const pasteNodeToolCache = reactive({
  hasSelection: false,
  clipboardCount: 0,
})

export function pickPasteTarget(nodeId: string): void {
  const id = nodeId.trim()
  if (!id) return
  pasteNodeToolState.targetSpecified = true
  pasteNodeToolState.targetNodeId = id
}

export function clearPasteTarget(): void {
  pasteNodeToolState.targetSpecified = false
  pasteNodeToolState.targetNodeId = ''
}

export function resolvePasteTargetId(primarySelectedId: string): string {
  if (pasteNodeToolState.targetSpecified) {
    return pasteNodeToolState.targetNodeId.trim()
  }
  return primarySelectedId.trim()
}
