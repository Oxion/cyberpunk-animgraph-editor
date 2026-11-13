<template>
  <SidebarPanel
    :title="title"
    v-model:collapsed="collapsed"
    v-model:height="height"
    :fill="fill"
    :min-height="minHeight"
    :max-height="maxHeight"
  >
    <template v-if="headerComp" #header>
      <component :is="headerComp" />
    </template>

    <component v-if="bodyComp" :is="bodyComp" />
  </SidebarPanel>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getAppToolLabel } from '@/app/tools'
import { panelTool } from '@/app/tools/pipeline'
import SidebarPanel from './SidebarPanel.vue'
import { toolUiRegistry } from './tools/toolUiRegistry'

defineProps<{
  fill: boolean
  minHeight: number
  maxHeight: number
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })
const height = defineModel<number>('height', { required: true })

const tool = panelTool
const title = computed(() => (tool.value ? getAppToolLabel(tool.value) : 'Tools'))
const uiEntry = computed(() => (tool.value ? toolUiRegistry[tool.value] : null))
const bodyComp = computed(() => uiEntry.value?.Body)
const headerComp = computed(() => uiEntry.value?.Header)
</script>

<style>
.tool-hint {
  margin: 0;
  color: #c8c8dc;
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
}

.tool-hint--muted {
  color: #8a8a9a;
  text-align: left;
}

.tool-hint--hotkeys {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px 6px;
}

.tool-action-info {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}

.tool-action-label {
  color: #a0a0b0;
}

.tool-action-value {
  color: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
}
</style>
