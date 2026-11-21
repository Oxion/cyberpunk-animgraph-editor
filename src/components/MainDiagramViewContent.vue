<script lang="ts">
export {
  isPixiDiagramViewContentExposeRef as isMainDiagramViewContentExposeRef,
  type IPixiDiagramViewContentExposeRef as IMainDiagramViewContentExposeRef,
} from './PixiDiagramViewContent.vue'
</script>

<script setup lang="ts">
import { ref } from 'vue'
import PixiDiagramViewContent, {
  type IPixiDiagramViewContentExposeRef,
} from './PixiDiagramViewContent.vue'
import type { DiagramConnection, RenderData } from '../utils/graph/diagramTypes'

defineProps<{
  graphData: RenderData
  active?: boolean
}>()

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
    ref="hostRef"
    :graph-data="graphData"
    :active="active"
    @node-select="(...args) => emit('nodeSelect', ...args)"
    @open-scope="(id) => emit('openScope', id)"
    @pin-connect="(p) => emit('pinConnect', p)"
    @pin-rewire="(p) => emit('pinRewire', p)"
    @ready="emit('ready')"
  />
</template>
