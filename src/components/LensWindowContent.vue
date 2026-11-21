<script lang="ts">
export {
  isPixiDiagramViewContentExposeRef as isLensWindowContentExposeRef,
  type IPixiDiagramViewContentExposeRef as ILensWindowContentExposeRef,
} from './PixiDiagramViewContent.vue'
</script>

<script setup lang="ts">
import { computed, ref } from 'vue'
import PixiDiagramViewContent, {
  type IPixiDiagramViewContentExposeRef,
} from './PixiDiagramViewContent.vue'
import type { DiagramConnection, RenderData } from '../utils/graph/diagramTypes'
import type { CameraPresentOp } from '../types/WindowPresent'
import {
  applyCameraPresentOp,
  cameraOpToRectOptions,
  resolvePresentNodeId,
} from '../utils/windows/presentOps'
import type { PixiGraphRenderer } from '../utils/PixiGraphRenderer'

const props = withDefaults(
  defineProps<{
    graphData: RenderData
    rootNodeId: string
    hideScopeRoot?: boolean
    active?: boolean
    presentOp?: CameraPresentOp | null
    rightInset?: number
  }>(),
  {
    hideScopeRoot: false,
    active: true,
    presentOp: null,
    rightInset: 0,
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

const skipFit = computed(() => Boolean(props.presentOp && props.presentOp.id !== 'fit-scope'))

const focusNodeId = computed(() => {
  const op = props.presentOp
  if (!op || op.id === 'fit-scope') return undefined
  return resolvePresentNodeId(op, {
    graphData: props.graphData,
    scopeRootId: props.rootNodeId,
  })
})

const initialPresentOptions = computed(() => {
  const op = props.presentOp
  if (!op || op.id === 'fit-scope') return undefined
  return cameraOpToRectOptions(op, { rightInset: props.rightInset })
})

const presentDefaultFn = (renderer: PixiGraphRenderer) => {
  const op = props.presentOp
  if (!op || op.id === 'fit-scope') {
    renderer.fitViewToScope()
    return
  }
  applyCameraPresentOp(renderer, op, {
    graphData: props.graphData,
    scopeRootId: props.rootNodeId,
    rightInset: props.rightInset,
  })
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
    ref="hostRef"
    :graph-data="graphData"
    :active="active"
    :scope-root-id="rootNodeId"
    :hide-scope-root="hideScopeRoot"
    :skip-initial-fit="skipFit"
    :initial-present-node-id="focusNodeId"
    :initial-present-options="initialPresentOptions"
    :present-default-fn="presentDefaultFn"
    :remount-key="rootNodeId"
    @node-select="(...args) => emit('nodeSelect', ...args)"
    @open-scope="(id) => emit('openScope', id)"
    @pin-connect="(p) => emit('pinConnect', p)"
    @pin-rewire="(p) => emit('pinRewire', p)"
    @ready="emit('ready')"
  />
</template>
