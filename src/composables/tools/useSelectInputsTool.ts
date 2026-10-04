import { computed, watch } from 'vue'
import { selectedNodeIdsRef } from '../../stores/graphSession'
import { selectInputsToolCache } from '../../stores/tools'

export function useSelectInputsTool() {
  const toolData = computed(() => ({
    selectedCount: selectedNodeIdsRef.value.length,
  }))

  watch(
    toolData,
    (val) => {
      Object.assign(selectInputsToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}
