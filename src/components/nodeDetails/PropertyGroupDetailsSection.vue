<script setup lang="ts">
import { computed, inject } from 'vue'
import { PropertyReadonlyRow } from './controls'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'
import { getPropertyGroupSlotName } from '../../utils/graph/diagramAddPolicy'
import { getChildSlot } from '../../utils/graph/nodeChildSlots'

const { selectedNode } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const slotName = computed(() => {
  const node = selectedNode.value
  if (!node) return '—'
  return getPropertyGroupSlotName(node) ?? '—'
})

const childCount = computed(() => {
  const node = selectedNode.value
  if (!node) return 0
  return getChildSlot(node).filter((c) => c.visible !== false).length
})

const parentId = computed(() => selectedNode.value?.parent?.id ?? '—')

const groupTitle = computed(() => slotName.value)
</script>

<template>
  <div class="pg-details">
    <PropertyReadonlyRow label="title" :value="groupTitle" />
    <PropertyReadonlyRow label="slot" :value="slotName" />
    <PropertyReadonlyRow label="children" :value="String(childCount)" />
    <PropertyReadonlyRow label="parent" :value="parentId" />
  </div>
</template>

<style scoped>
.pg-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 2px;
}
</style>
