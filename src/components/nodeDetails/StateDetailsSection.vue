<script setup lang="ts">
import { computed, inject } from 'vue'
import HandleDataFieldsForm from './HandleDataFieldsForm.vue'
import { gatherTypedDataDetailsFields } from './handleDataFields'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'

const { selectedNode, selectedHandleData, handleDataRevision } =
  inject<NodeDetailsContext>(nodeDetailsContextKey)!

const fields = computed(() => {
  void handleDataRevision.value
  const data = selectedHandleData.value
  const node = selectedNode.value
  if (!data || !node) return []
  const nodesCount = Array.isArray(data.nodes) ? data.nodes.length : 0
  return gatherTypedDataDetailsFields(data, node.type, [
    { key: 'nodes', label: 'nodes', kind: 'readonly', text: String(nodesCount) },
  ])
})
</script>

<template>
  <HandleDataFieldsForm :fields="fields" />
</template>
