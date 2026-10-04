<template>
  <div class="state-links-view-content-root">
    <div
      ref="canvasRef"
      class="state-links-view-content"
      :class="{ 'state-links-view-content--inactive': !active }"
      title="Click to focus diagram"
      @pointerdown="onDiagramPointerDown"
    />
    <DiagramLoadingOverlay v-if="active && !viewReady" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DiagramConnection, RenderData } from '../utils/graph/diagramTypes'
import { PixiGraphRenderer, PresentWorldRectOptions } from '../utils/PixiGraphRenderer'
import {
  buildStateAppliedLinksDiagramData,
  findOutgoingTransitionsSectionGroupDiagramNode,
} from '../utils/graph/StateAppliedLinks'
import DiagramLoadingOverlay from './DiagramLoadingOverlay.vue'
import { focusDiagramHost } from '../utils/dom/focusDiagramHost'

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

const canvasRef = shallowRef<HTMLDivElement | null>(null)
const rendererRef = shallowRef<PixiGraphRenderer | null>(null)
const viewReady = ref(false)
const stateAppliedLinksDiagramDataRef = shallowRef<RenderData | null>(null)

const buildPresentWorldRectConfig = () => {
  if (!stateAppliedLinksDiagramDataRef.value) return
  
  const outgoingTransitionsSectionGroupDiagramNode = findOutgoingTransitionsSectionGroupDiagramNode(stateAppliedLinksDiagramDataRef.value)
  if (!outgoingTransitionsSectionGroupDiagramNode) return
  
  return {
    rect: outgoingTransitionsSectionGroupDiagramNode.bounds,
    options: DEFAULT_PRESENT_WORLD_RECT_OPTIONS,
  }
}

const presentDefault = () => {
  const renderer = rendererRef.value
  if (!renderer) return

  const presentWorldRectConfig = buildPresentWorldRectConfig()
  if (!presentWorldRectConfig) return

  renderer.presentWorldRect(presentWorldRectConfig.rect, presentWorldRectConfig.options)
}

const applyActiveState = () => {
  const instance = rendererRef.value
  if (!instance) return
  instance.setSuspended(!props.active)
}

const onDiagramPointerDown = () => {
  if (!props.active) return
  focusDiagramHost(canvasRef.value)
}

const mountRenderer = async () => {
  if (!canvasRef.value) return
  if (rendererRef.value) {
    applyActiveState()
    viewReady.value = true
    return
  }

  viewReady.value = false
  
  stateAppliedLinksDiagramDataRef.value = buildStateAppliedLinksDiagramData(props.graphData, props.stateNodeId)
  if (!stateAppliedLinksDiagramDataRef.value) {
    viewReady.value = true
    return
  }

  const renderer = new PixiGraphRenderer(canvasRef.value, stateAppliedLinksDiagramDataRef.value, {
    skipInitialFit: true,
    initialPresent: buildPresentWorldRectConfig(),
  })
  renderer.setOnNodeSelect((ids, primary) => emit('nodeSelect', ids, primary))
  renderer.setOnOpenNodeScope((nodeId) => emit('openScope', nodeId))
  renderer.setOnPinConnect((payload) => emit('pinConnect', payload))
  renderer.setOnPinRewire((payload) => emit('pinRewire', payload))
  rendererRef.value = renderer
  
  try {
    await renderer._initPromise
  } finally {
    if (rendererRef.value === renderer) {
      viewReady.value = true
      applyActiveState()
      presentDefault()
      emit('ready')
    }
  }
}

const fitView = () => {
  const bounds = stateAppliedLinksDiagramDataRef.value?.bounds
  if (bounds && bounds.width > 0 && bounds.height > 0) {
    rendererRef.value?.presentWorldRect(bounds, {
      align: 'center',
      fit: 'contain',
      padding: 20,
      minZoom: 0.05,
      maxZoom: 3,
    })
    return
  }
  rendererRef.value?.fitViewToScope()
}

const getRenderer = () => rendererRef.value

const focusCanvas = () => {
  if (!props.active) return
  focusDiagramHost(canvasRef.value)
}

onMounted(() => {
  void mountRenderer()
})

onUnmounted(() => {
  rendererRef.value?.destroy()
  rendererRef.value = null
  stateAppliedLinksDiagramDataRef.value = null
  viewReady.value = false
})

watch(
  () => props.active,
  () => {
    applyActiveState()
  }
)

watch(
  () => [props.graphData, props.stateNodeId] as const,
  (next, prev) => {
    if (prev && next[0] === prev[0] && next[1] === prev[1]) return
    rendererRef.value?.destroy()
    rendererRef.value = null
    stateAppliedLinksDiagramDataRef.value = null
    viewReady.value = false
    void mountRenderer()
  }
)

defineExpose({ fitView, presentDefault, getRenderer, focusCanvas })
</script>

<style scoped>
.state-links-view-content-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.state-links-view-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  outline: none;
  background: #1a1a1a;
}

.state-links-view-content--inactive {
  pointer-events: none;
}
</style>
