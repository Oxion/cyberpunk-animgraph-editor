<template>
  <div
    class="graph-view-layer"
    :class="{ 'graph-view-layer--preview': preview }"
    role="region"
    :aria-label="displayTitle"
  >
    <GraphViewHost
      :title="displayTitle"
      :actions="actions"
      :closable="true"
      :close-label="closeLabel"
      :show-chrome="showChrome"
      :breadcrumb-items="breadcrumbItems"
      @action="emit('action', $event)"
      @close="emit('close')"
      @jump="emit('jump', $event)"
    >
      <template v-if="preview || $slots['chrome-actions']" #chrome-actions>
        <button
          v-if="preview"
          type="button"
          class="graph-view-host__btn"
          title="Pin body (keep open; next preview opens separately)"
          @click="emit('pin')"
        >
          Pin
        </button>
        <slot name="chrome-actions" />
      </template>
      <slot />
    </GraphViewHost>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GraphViewBreadcrumbItem, GraphViewEntry } from '../types/GraphView'
import { getGraphViewChromeActions } from '../utils/views/viewRegistry'
import GraphViewHost from './GraphViewHost.vue'

const props = withDefaults(
  defineProps<{
    view: GraphViewEntry
    preview?: boolean
    closeLabel?: string
    showChrome?: boolean
    breadcrumbItems?: GraphViewBreadcrumbItem[]
  }>(),
  {
    preview: false,
    closeLabel: '← Back',
    showChrome: true,
    breadcrumbItems: () => [],
  }
)

const emit = defineEmits<{
  action: [actionId: string]
  close: []
  pin: []
  jump: [index: number]
}>()

const actions = computed(() => getGraphViewChromeActions(props.view))
const displayTitle = computed(() =>
  props.preview ? `Preview · ${props.view.title}` : props.view.title
)
</script>

<style scoped>
.graph-view-layer {
  position: absolute;
  inset: 0;
  z-index: 15;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #1a1a1a;
  /* Match root diagram — no inset card chrome */
  border-radius: 0;
  overflow: hidden;
}

.graph-view-layer--preview {
  box-shadow: inset 0 0 0 1px rgba(90, 159, 212, 0.35);
}

.graph-view-host__btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #4a5a6a;
  background: #2a3545;
  color: #c8d8e8;
  font-size: 12px;
  cursor: pointer;
}

.graph-view-host__btn:hover {
  background: #3a4a60;
  border-color: #5a9fd4;
}
</style>
