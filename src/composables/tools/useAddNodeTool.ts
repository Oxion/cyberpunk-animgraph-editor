import { listAddableTypesForSelection } from '../../utils/graph/nodeAddRules'
import type { DiagramAddActiveView } from '../../utils/graph/diagramAddPolicy'
import type { AnimgraphNode } from '../../utils/graph/animgraphTypes'
import {
  formatAddNodeDenial,
  formatDiagramAddPlace,
} from '../../components/tools/addNodeCopy'
import { getActiveGraphView } from '../../stores/activeGraphView'
import { getActiveRenderData } from '../../stores/graphProject'
import { selectedNodeRef } from '../../stores/graphSession'
import { addNodeToolCache } from '../../stores/tools'
import { computed, watch } from 'vue'

const shortType = (t: string) =>
  t.replace(/^animAnimNode_/, '').replace(/^anim/, '')

/** Cache only — add action: import addNewNode from stores/graphNodeCrud. */
export function useAddNodeTool() {
  const toolData = computed(() => {
    const gd = getActiveRenderData()
    const ctx = {
      handlesRegistry: (gd?.handlesRegistry ?? new Map()) as Map<string, AnimgraphNode>,
      allNodes: gd?.allNodes,
    }
    const activeView = getActiveGraphView() as DiagramAddActiveView | null
    const listed = listAddableTypesForSelection(
      selectedNodeRef.value,
      ctx,
      activeView ?? undefined
    )
    const { place, resolves, slotLabel } = listed

    const targetLabel = slotLabel
      ? `${formatDiagramAddPlace(place)} → ${slotLabel}`
      : formatDiagramAddPlace(place)

    const addableTypes = resolves
      .filter((r): r is Extract<typeof r, { ok: true }> => r.ok)
      .map((r) => {
        const displayNodeType = r.animgraphNodeType
          ? r.animgraphNodeType
          : r.diagramNodeType
        const shortDisplayNodeType = shortType(displayNodeType)
        const slotName = r.slot?.name
        const label = slotName
          ? `${shortDisplayNodeType} (${slotName})`
          : shortDisplayNodeType
        return {
          key: `${r.diagramNodeType}#${slotName ?? ''}`,
          diagramNodeType: r.diagramNodeType,
          idFromType: displayNodeType,
          label,
          ...(slotName ? { slotName } : {}),
        }
      })

    return {
      targetLabel,
      addableTypes,
      gateMessage: listed.ok ? '' : formatAddNodeDenial(listed.reasons),
    }
  })

  watch(
    toolData,
    (val) => {
      Object.assign(addNodeToolCache, val)
    },
    { immediate: true }
  )

  return { toolData }
}
