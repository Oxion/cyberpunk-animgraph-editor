<template>
  <div class="graph-view-host">
    <div
      v-if="chromeVisible"
      class="graph-view-host__chrome graph-view-host__chrome--floating"
    >
      <div class="graph-view-host__chrome-actions">
        <button
          v-if="closable"
          type="button"
          class="graph-view-host__btn"
          :title="closeLabel"
          @click="emit('close')"
        >
          {{ closeLabel }}
        </button>
        <button
          v-for="action in actions"
          :key="action.id"
          type="button"
          class="graph-view-host__btn"
          :title="action.title ?? action.label"
          @click="emit('action', action.id)"
        >
          {{ action.label }}
        </button>
        <slot name="chrome-actions" />
      </div>
      <p v-if="title" class="graph-view-host__title" :title="title">{{ title }}</p>
      <div v-if="$slots.toolbar" class="graph-view-host__toolbar">
        <slot name="toolbar" />
      </div>
    </div>
    <div class="graph-view-host__body">
      <slot />
    </div>
    <!-- Always visible when stacked — independent of floating chrome / sidebar -->
    <GraphViewBreadcrumb
      v-if="breadcrumbItems.length > 1"
      :items="breadcrumbItems"
      @jump="emit('jump', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { GraphViewBreadcrumbItem, GraphViewChromeAction } from '../types/GraphView'
import GraphViewBreadcrumb from './GraphViewBreadcrumb.vue'

const props = withDefaults(
  defineProps<{
    title?: string
    actions?: GraphViewChromeAction[]
    closable?: boolean
    closeLabel?: string
    showChrome?: boolean
    breadcrumbItems?: GraphViewBreadcrumbItem[]
  }>(),
  {
    title: '',
    actions: () => [],
    closable: true,
    closeLabel: '← Back',
    showChrome: true,
    breadcrumbItems: () => [],
  }
)

const emit = defineEmits<{
  action: [actionId: string]
  close: []
  jump: [index: number]
}>()

const chromeVisible = computed(
  () =>
    props.showChrome &&
    (Boolean(props.title) || props.actions.length > 0 || props.closable)
)
</script>

<style scoped>
.graph-view-host {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #1a1a1a;
}

.graph-view-host__chrome--floating {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 25;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  max-width: min(420px, calc(100% - 24px));
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(90, 90, 120, 0.55);
  background: rgba(18, 18, 28, 0.88);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.graph-view-host__title {
  margin: 0;
  max-width: 100%;
  font-size: 11px;
  font-weight: 500;
  color: #a8a8c0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.graph-view-host__chrome-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.graph-view-host__btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid #4a4a6a;
  background: rgba(60, 60, 90, 0.55);
  color: #d8d8e8;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}

.graph-view-host__btn:hover {
  border-color: #007acc;
  background: rgba(0, 122, 204, 0.25);
}

.graph-view-host__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.graph-view-host__body {
  flex: 1;
  min-height: 0;
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
