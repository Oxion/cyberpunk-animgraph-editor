export { pasteClipboardNodes } from '../../stores/graphNodeCrud'
import { computed, watch } from 'vue'
import { selectedNodeRef } from '../../stores/graphSession'
import { nodeClipboard } from '../../stores/nodeClipboard'
import { pasteNodeToolCache } from '../../stores/tools'

/** Cache only — paste action: import pasteClipboardNodes from stores/graphNodeCrud. */
export function usePasteNodeTool() {
  const toolData = computed(() => ({
    hasSelection: Boolean(selectedNodeRef.value),
    clipboardCount: nodeClipboard.value?.items.length ?? 0,
  }))

  watch(
    toolData,
    (val) => {
      Object.assign(pasteNodeToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}
