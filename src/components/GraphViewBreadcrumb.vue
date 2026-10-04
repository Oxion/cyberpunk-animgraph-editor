<template>
  <nav v-if="items.length > 0" class="graph-view-breadcrumb" aria-label="Diagram view path">
    <ol class="graph-view-breadcrumb__list">
      <li v-for="(item, i) in items" :key="item.id" class="graph-view-breadcrumb__item">
        <button
          type="button"
          class="graph-view-breadcrumb__crumb"
          :class="{ 'graph-view-breadcrumb__crumb--current': i === items.length - 1 }"
          :disabled="i === items.length - 1"
          :title="item.crumb"
          @click="emit('jump', item.index)"
        >
          {{ item.crumb }}
        </button>
        <span v-if="i < items.length - 1" class="graph-view-breadcrumb__sep" aria-hidden="true">/</span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import type { GraphViewBreadcrumbItem } from '../types/GraphView'

defineProps<{
  items: GraphViewBreadcrumbItem[]
}>()

const emit = defineEmits<{
  jump: [index: number]
}>()
</script>

<style scoped>
.graph-view-breadcrumb {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 20;
  max-width: min(72%, 560px);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid #1f1f1f;
  background: #303030;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
}

.graph-view-breadcrumb__list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.graph-view-breadcrumb__item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.graph-view-breadcrumb__crumb {
  max-width: 160px;
  padding: 2px 6px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #999999;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}

.graph-view-breadcrumb__crumb:hover:not(:disabled) {
  background: #3e3e3e;
  color: #e6e6e6;
}

.graph-view-breadcrumb__crumb--current,
.graph-view-breadcrumb__crumb:disabled {
  color: #e6e6e6;
  cursor: default;
}

.graph-view-breadcrumb__sep {
  color: #545454;
  font-size: 11px;
}
</style>
