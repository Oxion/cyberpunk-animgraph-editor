<template>
  <SidebarPanel
    :title="title"
    v-model:collapsed="collapsed"
    v-model:height="height"
    :fill="fill"
    :min-height="minHeight"
    :max-height="maxHeight"
  >
    <template #header>
      <button
        type="button"
        class="sidebar-node-details-btn"
        :title="openScopeTitle"
        :disabled="!hasSelection"
        @click="emit('openBody')"
      >
        <ScanEyeIcon :size="14" />
      </button>
      <button
        type="button"
        class="sidebar-node-details-btn"
        title="Open children in lens window (Shift: include node itself)"
        :disabled="!hasSelection"
        @click="emit('openLens', $event)"
      >
        <AppWindowIcon :size="14" />
      </button>
      <button
        type="button"
        class="sidebar-node-details-btn"
        title="Pan to node"
        :disabled="!hasSelection"
        @click="emit('panTo')"
      >
        <LocateFixedIcon :size="14" />
      </button>
    </template>
    <template v-if="hasSelection && visibleTypeActions.length > 0" #subheader>
      <NodeDetailsTypeActions />
    </template>
    <div v-if="!hasSelection" class="node-details-empty">
      <p>Select a node on the graph</p>
    </div>
    <div v-else class="sidebar-node-details-body">
      <NodeDetailsAccordion />
    </div>
  </SidebarPanel>
</template>

<script setup lang="ts">
import { AppWindowIcon, LocateFixedIcon, ScanEyeIcon } from 'lucide-vue-next'
import NodeDetailsAccordion from './NodeDetailsAccordion.vue'
import NodeDetailsTypeActions from './nodeDetails/NodeDetailsTypeActions.vue'
import SidebarPanel from './SidebarPanel.vue'
import { useDiagramDetailsTypeActions } from './nodeDetails/useDiagramDetailsTypeActions'

defineProps<{
  title: string
  hasSelection: boolean
  openScopeTitle: string
  fill: boolean
  minHeight: number
  maxHeight: number
}>()

const collapsed = defineModel<boolean>('collapsed', { default: false })
const height = defineModel<number>('height', { required: true })

const emit = defineEmits<{
  openBody: []
  openLens: [event: MouseEvent]
  panTo: []
}>()

const { visibleTypeActions } = useDiagramDetailsTypeActions()
</script>

<style scoped>
.sidebar-node-details-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  background: #2a3545;
  border: 1px solid rgba(100, 100, 130, 0.5);
  color: #c8d8e8;
}

.sidebar-node-details-btn:hover:not(:disabled) {
  background: #3a4a60;
}

.sidebar-node-details-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.sidebar-node-details-body {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-height: 0;
}

.node-details-empty {
  padding: 8px 0;
  color: #999;
  font-size: 12px;
}
</style>
