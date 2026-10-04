<script setup lang="ts">
import { computed, inject } from 'vue'
import { PropertyTextField } from './controls'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'
import { readDiagramGroupLabel } from '../../utils/graph/diagramFrameNodes'

const { selectedNode, saveNodeLabel } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const label = computed(() => {
  const node = selectedNode.value
  if (!node) return ''
  return readDiagramGroupLabel(node)
})
</script>

<template>
  <div class="frame-details">
    <PropertyTextField
      label="label"
      :model-value="label"
      placeholder="Group"
      @update:model-value="saveNodeLabel"
    />
  </div>
</template>

<style scoped>
.frame-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}
</style>
