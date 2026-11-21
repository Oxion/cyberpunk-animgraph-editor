<script lang="ts">
export {
  isPixiDiagramViewContentExposeRef as isStateLinksViewContentExposeRef,
  type IPixiDiagramViewContentExposeRef as IStateLinksViewContentExposeRef,
} from './PixiDiagramViewContent.vue'
</script>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import PixiDiagramViewContent, {
  type IPixiDiagramViewContentExposeRef,
} from './PixiDiagramViewContent.vue'
import type { DiagramConnection, RenderData } from '../utils/graph/diagramTypes'
import {
  buildStateAppliedLinksDiagramData,
  findOutgoingTransitionsSectionGroupDiagramNode,
} from '../utils/graph/StateAppliedLinks'
import type { PresentWorldRectOptions } from '../utils/PixiGraphRenderer'
import type { PixiGraphRenderer } from '../utils/PixiGraphRenderer'

const DEFAULT_PRESENT_WORLD_RECT_OPTIONS: PresentWorldRectOptions = {
  align: 'top-end',
  fit: 'none',
  zoom: 1,
  minZoom: 1,
  maxZoom: 1,
  padding: 16,
}

const props = withDefaults(
  defineProps<{
    graphData: RenderData
    stateNodeId: string
    active?: boolean
  }>(),
  {
    active: true,
  }
)

const emit = defineEmits<{
  nodeSelect: [nodeIds: string[], primaryNodeId: string | null]
  openScope: [nodeId: string]
  pinConnect: [payload: { fromNodeId: string; toNodeId: string; pinName: string }]
  pinRewire: [
    payload: {
      grabbedConnection: DiagramConnection
      hostNodeId: string
      pinName: string
      newToNodeId?: string
      newPinName?: string
    },
  ]
  ready: []
}>()

const hostRef = ref<IPixiDiagramViewContentExposeRef | null>(null)
const derivedGraphData = shallowRef<RenderData | null>(null)

const rebuildDerived = () => {
  derivedGraphData.value = buildStateAppliedLinksDiagramData(props.graphData, props.stateNodeId)
}

rebuildDerived()

watch(
  () => [props.graphData, props.stateNodeId] as const,
  () => {
    rebuildDerived()
  }
)

const initialPresent = computed(() => {
  const data = derivedGraphData.value
  if (!data) return undefined
  const group = findOutgoingTransitionsSectionGroupDiagramNode(data)
  if (!group) return undefined
  return {
    rect: group.bounds,
    options: DEFAULT_PRESENT_WORLD_RECT_OPTIONS,
  }
})

const presentDefaultFn = (renderer: PixiGraphRenderer) => {
  const data = derivedGraphData.value
  if (!data) return
  const group = findOutgoingTransitionsSectionGroupDiagramNode(data)
  if (!group) return
  renderer.presentWorldRect(group.bounds, DEFAULT_PRESENT_WORLD_RECT_OPTIONS)
}

const fitViewFn = (renderer: PixiGraphRenderer) => {
  const bounds = derivedGraphData.value?.bounds
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    renderer.presentWorldRect(bounds, {
      align: 'center',
      fit: 'contain',
      padding: 20,
      minZoom: 0.05,
      maxZoom: 3,
    })
    return
  }
  renderer.fitViewToScope()
}

defineExpose({
  fitView: () => hostRef.value?.fitView(),
  presentDefault: () => hostRef.value?.presentDefault(),
  getRenderer: () => hostRef.value?.getRenderer() ?? null,
  getDiagramRenderer: () => hostRef.value?.getDiagramRenderer() ?? null,
  focusRenderer: () => hostRef.value?.focusRenderer(),
  focusDiagramRenderer: () => hostRef.value?.focusDiagramRenderer(),
  applySimOverlay: (snap?: Parameters<IPixiDiagramViewContentExposeRef['applySimOverlay']>[0]) =>
    hostRef.value?.applySimOverlay(snap),
})
</script>

<template>
  <PixiDiagramViewContent
    v-if="derivedGraphData"
    ref="hostRef"
    :graph-data="derivedGraphData"
    :active="active"
    :skip-initial-fit="true"
    :initial-present="initialPresent"
    :present-default-fn="presentDefaultFn"
    :fit-view-fn="fitViewFn"
    :remount-key="stateNodeId"
    @node-select="(...args) => emit('nodeSelect', ...args)"
    @open-scope="(id) => emit('openScope', id)"
    @pin-connect="(p) => emit('pinConnect', p)"
    @pin-rewire="(p) => emit('pinRewire', p)"
    @ready="emit('ready')"
  />
</template>
