<template>
  <SidebarPanel
    title="Graph Info"
    closable
    v-model:collapsed="collapsed"
    v-model:height="height"
    :fill="fill"
    :min-height="minHeight"
    :max-height="maxHeight"
    @close="emit('close')"
  >
    <div class="info-item">
      <label>Total Nodes:</label>
      <span>{{ totalNodes }}</span>
    </div>
    <div class="info-item">
      <label>Node Types:</label>
      <span>{{ nodeTypeCount }}</span>
    </div>
    <div class="info-item">
      <label>File Size:</label>
      <span>{{ fileSizeLabel }}</span>
    </div>
  </SidebarPanel>
</template>

<script setup lang="ts">
import SidebarPanel from './SidebarPanel.vue'

defineProps<{
  totalNodes: number
  nodeTypeCount: number
  fileSizeLabel: string
  fill: boolean
  minHeight: number
  maxHeight: number
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })
const height = defineModel<number>('height', { required: true })

const emit = defineEmits<{
  close: []
}>()
</script>

<style scoped>
.info-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
}

.info-item label {
  color: #c8c8dc;
}

.info-item span {
  color: #ffffff;
  font-weight: 600;
}
</style>
