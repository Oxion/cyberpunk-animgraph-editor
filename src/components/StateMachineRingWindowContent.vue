<template>
  <div class="sm-ring-window-content">
    <StateMachineRingView
      v-if="presentation"
      ref="ringViewRef"
      fill-container
      :presentation="presentation"
      :sim-highlight="simHighlight"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import StateMachineRingView from './StateMachineRingView.vue'
import type { RenderData } from '../utils/graph/diagramTypes'
import type { StateMachineRingSimHighlight } from '../utils/graph/DiagramPixiPainter'
import {
  buildStateMachineRingPresentation,
  resolveStateMachineInfoNode,
} from '../utils/graph/DiagramConversion'

const props = withDefaults(
  defineProps<{
    graphData: RenderData
    stateMachineNodeId: string
    simHighlight?: StateMachineRingSimHighlight | null
  }>(),
  { simHighlight: null }
)

const ringViewRef = ref<InstanceType<typeof StateMachineRingView> | null>(null)

const presentation = computed(() => {
  const node = props.graphData.allNodes.get(props.stateMachineNodeId)
  const infoNode = resolveStateMachineInfoNode(node, props.graphData.allNodes)
  if (!infoNode) return null
  return buildStateMachineRingPresentation(infoNode, props.graphData)
})

const fitView = () => {
  ringViewRef.value?.fitView()
}

watch(
  () => props.stateMachineNodeId,
  () => {
    requestAnimationFrame(() => fitView())
  }
)

defineExpose({ fitView })
</script>

<style scoped>
.sm-ring-window-content {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 8px;
  box-sizing: border-box;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
}

.sm-ring-window-content > :deep(.state-machine-ring-view) {
  flex: 1;
  min-height: 0;
}
</style>
