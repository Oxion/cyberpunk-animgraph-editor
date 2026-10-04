<script setup lang="ts">
import { computed, inject } from 'vue'
import { PropertyReadonlyRow } from './controls'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'

const { selectedNode, selectedNodeConnectionsComputed } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const rows = computed(() => {
  const node = selectedNode.value
  if (!node) return [{ label: 'id', value: '—' }]

  const conns = selectedNodeConnectionsComputed.value
  const cross =
    conns?.incoming.find((c) => c.metadata?.originalTo) ??
    conns?.outgoing.find((c) => c.metadata?.originalTo) ??
    null

  if (cross?.metadata?.originalFrom && cross.metadata.originalTo) {
    return [
      { label: 'id', value: node.id },
      { label: 'from', value: cross.metadata.originalFrom },
      { label: 'to', value: cross.metadata.originalTo },
      { label: 'pin', value: cross.pinName ?? '—' },
    ]
  }

  return [{ label: 'id', value: node.id }]
})
</script>

<template>
  <div class="portal-details">
    <PropertyReadonlyRow
      v-for="row in rows"
      :key="row.label"
      :label="row.label"
      :value="row.value"
    />
  </div>
</template>

<style scoped>
.portal-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}
</style>
