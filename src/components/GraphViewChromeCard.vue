<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft } from 'lucide-vue-next'
import type { GraphViewEntry } from '../types/GraphView'
import { getGraphViewChromeActions } from '../utils/views/viewRegistry'
import SidebarPanel from './SidebarPanel.vue'

const props = withDefaults(
  defineProps<{
    view: GraphViewEntry
    closeLabel?: string
    preview?: boolean
  }>(),
  {
    closeLabel: '← Back',
    preview: false,
  }
)

const emit = defineEmits<{
  close: []
  action: [actionId: string]
  pin: []
}>()

const title = computed(() =>
  props.preview ? `Preview · ${props.view.title}` : props.view.title
)
const actions = computed(() => getGraphViewChromeActions(props.view))
</script>

<template>
  <SidebarPanel header-only :title="title">
    <template #leading>
      <button
        type="button"
        class="graph-view-chrome-card__back"
        :title="closeLabel"
        @click="emit('close')"
      >
        <ArrowLeft :size="14" />
      </button>
    </template>
    <template #header>
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="graph-view-chrome-card__btn"
        :title="action.title ?? action.label"
        @click="emit('action', action.id)"
      >
        {{ action.label }}
      </button>
      <button
        v-if="preview"
        type="button"
        class="graph-view-chrome-card__btn"
        title="Pin slot (keep open; next preview opens separately)"
        @click="emit('pin')"
      >
        Pin
      </button>
    </template>
  </SidebarPanel>
</template>

<style scoped>
.graph-view-chrome-card__back {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #999999;
  cursor: pointer;
}

.graph-view-chrome-card__back:hover {
  background: #3e3e3e;
  color: #e6e6e6;
}

.graph-view-chrome-card__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  background: #2a3545;
  border: 1px solid rgba(100, 100, 130, 0.5);
  color: #c8d8e8;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.graph-view-chrome-card__btn:hover {
  background: #3a4a60;
}
</style>
