import { computed, watch } from 'vue'
import { selectedNodeIdsRef } from '../../stores/graphSession'
import { arrangeSelectionToolCache } from '../../stores/tools'

export function useArrangeSelectionTool() {
  const toolData = computed(() => {
    const ids = selectedNodeIdsRef.value
    return {
      anchorId: ids[0] ?? null,
      busy: arrangeSelectionToolCache.busy,
    }
  })

  watch(
    toolData,
    (val) => {
      Object.assign(arrangeSelectionToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}
