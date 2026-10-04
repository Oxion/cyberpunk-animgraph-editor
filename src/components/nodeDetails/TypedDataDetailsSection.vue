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
  return gatherTypedDataDetailsFields(data, node.type)
})
</script>

<template>
  <HandleDataFieldsForm :fields="fields" />
</template>
