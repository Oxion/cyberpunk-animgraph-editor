<script lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DiagramConnection, RenderData } from '../utils/graph/diagramTypes'
import { PixiGraphRenderer, type PresentWorldRectOptions } from '../utils/PixiGraphRenderer'
import { focusDiagramHost } from '../utils/dom/focusDiagramHost'
import { PixiDiagramNode } from '@/utils/pixi/PixiDiagramNode.ts'
import { isDiagramOverviewLeaf } from '@/utils/graph/DiagramConversion.ts'
import { PixiDiagramRendererSimOverlayPlugin } from '@/utils/pixi/PixiDiagramRendererSimOverlayPlugin'
import { VisualOptionsStageChangeKind } from '@/utils/pixi/PixiDiagramRendererNodeVisualOptionsStageChange'
import {
  notifyConnectionDragBegin,
  notifyConnectionDragEnd,
} from '@/app/tools/connectionDragBridge'
import type { SimSnapshot } from '../utils/sim'
import DiagramLoadingOverlay from './DiagramLoadingOverlay.vue'
import { PixiDiagramRendererScreenSpaceChromePlugin } from '@/utils/pixi/PixiDiagramRendererScreenSpaceChromePlugin.ts'

export interface IPixiDiagramViewContentExposeRef {
  fitView: () => void
  presentDefault: () => void
  getRenderer: () => PixiGraphRenderer | null
  getDiagramRenderer: () => PixiGraphRenderer | null
  focusRenderer: () => void
  focusDiagramRenderer: () => void
  applySimOverlay: (snapshot?: SimSnapshot) => void
}

export const isPixiDiagramViewContentExposeRef = (
  value: unknown
): value is IPixiDiagramViewContentExposeRef => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getRenderer' in value &&
    'fitView' in value &&
    'presentDefault' in value &&
    'applySimOverlay' in value
  )
}
</script>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    graphData: RenderData
    active?: boolean
    scopeRootId?: string
    hideScopeRoot?: boolean
    skipInitialFit?: boolean
    initialPresent?: {
      rect: { x: number; y: number; width: number; height: number }
      options?: PresentWorldRectOptions
    }
    initialPresentNodeId?: string
    initialPresentOptions?: PresentWorldRectOptions
    /** Called after mount/ready to frame the camera (kind-specific). */
    presentDefaultFn?: (renderer: PixiGraphRenderer) => void
    fitViewFn?: (renderer: PixiGraphRenderer) => void
    remountKey?: unknown
  }>(),
  {
    active: true,
    hideScopeRoot: false,
    skipInitialFit: false,
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

const rendererContainerElementRef = shallowRef<HTMLDivElement | null>(null)
const rendererRef = shallowRef<PixiGraphRenderer | null>(null)
const simPluginRef = shallowRef<PixiDiagramRendererSimOverlayPlugin | null>(null)
const viewReadyRef = ref(false)

const presentDefault = () => {
  const instance = rendererRef.value
  if (!instance) return
  if (props.presentDefaultFn) {
    props.presentDefaultFn(instance)
    return
  }
  instance.fitViewToScope()
}

const fitView = () => {
  const instance = rendererRef.value
  if (!instance) return
  if (props.fitViewFn) {
    props.fitViewFn(instance)
    return
  }
  instance.fitViewToScope()
}

const applyActiveState = () => {
  const instance = rendererRef.value
  if (!instance) return
  instance.setSuspended(!props.active)
}

const onDiagramPointerDown = () => {
  if (!props.active) return
  focusDiagramHost(rendererContainerElementRef.value)
}

const applySimOverlay = (snapshot?: SimSnapshot) => {
  simPluginRef.value?.applySimSnapshot(snapshot)
}

const mountRenderer = async () => {
  if (!rendererContainerElementRef.value) return
  if (rendererRef.value) {
    applyActiveState()
    viewReadyRef.value = true
    return
  }

  viewReadyRef.value = false
  const simPlugin = new PixiDiagramRendererSimOverlayPlugin()
  simPluginRef.value = simPlugin

  const screenSpaceChromePlugin = new PixiDiagramRendererScreenSpaceChromePlugin()

  const renderer = new PixiGraphRenderer({
    containerElement: rendererContainerElementRef.value,
    graphData: props.graphData,
    ensureStaticResources: async () => {
      PixiDiagramNode.ensureStaticResources()
    },
    createNode: (context, diagramNode) => {
      return new PixiDiagramNode({
        ctx: context,
        diagramNodeId: diagramNode.id,
        diagramNodeType: diagramNode.type,
        showOpenScopeBtn: isDiagramOverviewLeaf(diagramNode),
        onOpenScope: (node) => emit('openScope', node.diagramNodeId),
      })
    },
    updateNode: (rendererNode, diagramNode) => {
      rendererNode.stage({
        kind: VisualOptionsStageChangeKind,
        visualOptions: PixiDiagramNode.resolvePixiDiagramNodeVisualOptions(
          props.graphData,
          diagramNode
        ),
      })
    },
    resolveVisualOptions: (graphData, diagramNode) =>
      PixiDiagramNode.resolvePixiDiagramNodeVisualOptions(graphData, diagramNode),
    scopeRootId: props.scopeRootId,
    hideScopeRoot: props.hideScopeRoot,
    skipInitialFit: props.skipInitialFit || Boolean(props.initialPresent) || Boolean(props.initialPresentNodeId),
    initialPresent: props.initialPresent,
    initialPresentNodeId: props.initialPresentNodeId,
    initialPresentOptions: props.initialPresentOptions,
    plugins: [
      screenSpaceChromePlugin,
      simPlugin,
    ],
  })
  renderer.setOnNodeSelect((ids, primary) => emit('nodeSelect', ids, primary))
  renderer.setOnPinConnect((payload) => emit('pinConnect', payload))
  renderer.setOnPinRewire((payload) => emit('pinRewire', payload))
  renderer.setOnConnectionDragBegin(notifyConnectionDragBegin)
  renderer.setOnConnectionDragEnd(notifyConnectionDragEnd)
  rendererRef.value = renderer

  try {
    await renderer._initPromise
  } finally {
    if (rendererRef.value === renderer) {
      viewReadyRef.value = true
      applyActiveState()
      emit('ready')
    }
  }
}

const getRenderer = () => rendererRef.value
const getDiagramRenderer = () => rendererRef.value

const focusRenderer = () => {
  if (!props.active) return
  focusDiagramHost(rendererContainerElementRef.value)
}

onMounted(() => {
  void mountRenderer()
})

onUnmounted(() => {
  rendererRef.value?.destroy()
  rendererRef.value = null
  simPluginRef.value = null
  viewReadyRef.value = false
})

watch(
  () => props.active,
  () => {
    applyActiveState()
  }
)

watch(
  () =>
    [
      props.graphData,
      props.scopeRootId,
      props.hideScopeRoot,
      props.remountKey,
    ] as const,
  (next, prev) => {
    if (
      prev &&
      next[0] === prev[0] &&
      next[1] === prev[1] &&
      next[2] === prev[2] &&
      next[3] === prev[3]
    ) {
      return
    }
    rendererRef.value?.destroy()
    rendererRef.value = null
    simPluginRef.value = null
    viewReadyRef.value = false
    void mountRenderer()
  }
)

defineExpose<IPixiDiagramViewContentExposeRef>({
  fitView,
  presentDefault,
  getRenderer,
  getDiagramRenderer,
  focusRenderer,
  focusDiagramRenderer: focusRenderer,
  applySimOverlay,
})
</script>

<template>
  <div class="pixi-diagram-view-content-root">
    <div
      ref="rendererContainerElementRef"
      class="pixi-diagram-view-content"
      :class="{ 'pixi-diagram-view-content--inactive': !active }"
      title="Click to focus diagram"
      @pointerdown="onDiagramPointerDown"
    />
    <DiagramLoadingOverlay v-if="active && !viewReadyRef" />
  </div>
</template>

<style scoped>
.pixi-diagram-view-content-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.pixi-diagram-view-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  outline: none;
  background: #1a1a1a;
  cursor: default;
}

.pixi-diagram-view-content--inactive {
  pointer-events: none;
  visibility: hidden;
}
</style>
