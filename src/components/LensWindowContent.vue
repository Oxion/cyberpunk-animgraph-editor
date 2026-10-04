<template>
  <div class="lens-window-content-root">
    <div
      ref="canvasRef"
      class="lens-window-content"
      :class="{ 'lens-window-content--inactive': !active }"
      title="Click to focus diagram"
      @pointerdown="onDiagramPointerDown"
    />
    <DiagramLoadingOverlay v-if="active && !viewReady" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DiagramConnection, RenderData } from '../utils/graph/diagramTypes'
import { PixiGraphRenderer } from '../utils/PixiGraphRenderer'
import type { CameraPresentOp } from '../types/WindowPresent'
import {
  applyCameraPresentOp,
  cameraOpToRectOptions,
  resolvePresentNodeId,
} from '../utils/windows/presentOps'
import { focusDiagramHost } from '../utils/dom/focusDiagramHost'
import DiagramLoadingOverlay from './DiagramLoadingOverlay.vue'

const props = withDefaults(
  defineProps<{
    graphData: RenderData
    rootNodeId: string
    /** Skip painting scope root; show its children as top-level (SM children view). */
    hideScopeRoot?: boolean
    /** Top-of-stack view receives input; parents stay mounted but suspended. */
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

const canvasRef = shallowRef<HTMLDivElement | null>(null)
const renderer = shallowRef<PixiGraphRenderer | null>(null)
const viewReady = ref(false)

const presentDefault = () => {
  const instance = renderer.value
  const op = props.presentOp
  if (!instance) return
  if (!op || op.id === 'fit-scope') {
    instance.fitViewToScope()
    return
  }
  applyCameraPresentOp(instance, op, {
    graphData: props.graphData,
    scopeRootId: props.rootNodeId,
    rightInset: props.rightInset,
  })
}

const applyActiveState = () => {
  const instance = renderer.value
  if (!instance) return
  instance.setSuspended(!props.active)
}

const onDiagramPointerDown = () => {
  if (!props.active) return
  focusDiagramHost(canvasRef.value)
}

const mountRenderer = async () => {
  if (!canvasRef.value) return
  // Keep existing instance when only active flag flips — parent layers must survive stack push.
  if (renderer.value) {
    applyActiveState()
    viewReady.value = true
    return
  }
  viewReady.value = false
  const op = props.presentOp
  const skipFit = Boolean(op && op.id !== 'fit-scope')
  const focusNodeId =
    op && op.id !== 'fit-scope'
      ? resolvePresentNodeId(op, {
          graphData: props.graphData,
          scopeRootId: props.rootNodeId,
        })
      : undefined
  const instance = new PixiGraphRenderer(canvasRef.value, props.graphData, {
    scopeRootId: props.rootNodeId,
    hideScopeRoot: props.hideScopeRoot,
    skipInitialFit: skipFit,
    initialPresentNodeId: focusNodeId,
    initialPresentOptions:
      op && op.id !== 'fit-scope'
        ? cameraOpToRectOptions(op, { rightInset: props.rightInset })
        : undefined,
  })
  instance.setOnNodeSelect((ids, primary) => emit('nodeSelect', ids, primary))
  instance.setOnOpenNodeScope((nodeId) => emit('openScope', nodeId))
  instance.setOnPinConnect((payload) => emit('pinConnect', payload))
  instance.setOnPinRewire((payload) => emit('pinRewire', payload))
  renderer.value = instance
  try {
    await instance._initPromise
  } finally {
    if (renderer.value === instance) {
      viewReady.value = true
      applyActiveState()
      presentDefault()
      emit('ready')
    }
  }
}

const fitView = () => {
  renderer.value?.fitViewToScope()
}

const getRenderer = () => renderer.value

const focusCanvas = () => {
  if (!props.active) return
  focusDiagramHost(canvasRef.value)
}

onMounted(() => {
  void mountRenderer()
})

onUnmounted(() => {
  renderer.value?.destroy()
  renderer.value = null
  viewReady.value = false
})

watch(
  () => props.active,
  () => {
    applyActiveState()
  }
)

// Remount only if graph identity or scope identity changes for THIS layer instance.
watch(
  () => [props.graphData, props.rootNodeId, props.hideScopeRoot] as const,
  (next, prev) => {
    if (
      prev &&
      next[0] === prev[0] &&
      next[1] === prev[1] &&
      next[2] === prev[2]
    ) {
      return
    }
    renderer.value?.destroy()
    renderer.value = null
    viewReady.value = false
    void mountRenderer()
  }
)

defineExpose({ fitView, presentDefault, getRenderer, focusCanvas })
</script>

<style scoped>
.lens-window-content-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.lens-window-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #1a1a1a;
  cursor: default;
}

.lens-window-content--inactive {
  pointer-events: none;
  visibility: hidden;
}
</style>
