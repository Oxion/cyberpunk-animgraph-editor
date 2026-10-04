import { computed, watch } from 'vue'
import { selectedNodeRef } from '../../stores/graphSession'
import { createConnectionToolCache } from '../../stores/tools'

/**
 * Connection wiring APIs live in stores/graphWiring (+ graphWireRecord for history).
 * This module only syncs tool cache; re-exports for callers that still import from here.
 */
export {
  EMPTY_CONNECT_RESULT,
  afterWireChange,
  createConnectionCore,
  createDiagramOnlyConnection,
  deleteConnectionCore,
  setWiringNotifySelectedHandleDataChanged,
} from '../../stores/graphWiring'

export {
  paintAndRecordConnect,
  handlePinConnect,
  handlePinRewire,
  createConnection,
  deleteConnection,
} from '../../stores/graphWireRecord'

/** Cache sync only — runs while addConnection tool runner is active. */
export function useCreateConnectionTool() {
  const toolData = computed(() => ({
    hasSelection: Boolean(selectedNodeRef.value),
  }))

  watch(
    toolData,
    (val) => {
      Object.assign(createConnectionToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}
