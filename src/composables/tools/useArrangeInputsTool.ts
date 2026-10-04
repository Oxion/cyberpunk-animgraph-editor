import { computed, watch } from 'vue'
import { getConnectionKey } from '../../utils/graph/diagramModel'
import {
  selectedIncomingConnectionsRef,
  selectedNodeConnectionsComputed,
} from '../../stores/graphSession'
import { arrangeInputsToolCache } from '../../stores/tools'

export function useArrangeInputsTool() {
  const toolData = computed(() => {
    const connections = selectedNodeConnectionsComputed.value
    const selectedKeys = selectedIncomingConnectionsRef.value
    const incoming = (connections?.incoming ?? []).map((conn) => {
      const key = getConnectionKey(conn)
      return {
        key,
        label: `${conn.from} ${conn.pinName || ''}`.trim(),
        selected: selectedKeys.has(key),
      }
    })
    return {
      incoming,
      selectedCount: selectedKeys.size,
    }
  })

  watch(
    toolData,
    (val) => {
      Object.assign(arrangeInputsToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}
