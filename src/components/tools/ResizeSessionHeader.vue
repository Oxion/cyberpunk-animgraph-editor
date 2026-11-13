<template>
  <div v-if="session" class="tool-session-header" :title="titleText">
    <span class="tool-session-header__item">
      <span class="tool-session-header__k">size</span>
      <span class="tool-session-header__v">
        {{ formatNumber(size.width) }}×{{ formatNumber(size.height) }}
      </span>
    </span>
    <span class="tool-session-header__sep">·</span>
    <span class="tool-session-header__item">
      <span class="tool-session-header__k">pos</span>
      <span class="tool-session-header__v">
        {{ formatNumber(position.x) }},{{ formatNumber(position.y) }}
      </span>
    </span>
    <span class="tool-session-header__sep">·</span>
    <span class="tool-session-header__item">
      <span class="tool-session-header__k">Δ</span>
      <span class="tool-session-header__v">
        {{ formatNumber(sizeDelta.width) }},{{ formatNumber(sizeDelta.height) }}
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { nodePositionRef, nodeSizeRef, selectedNodeRef } from '../../stores/graphSession'
import { resizeSessionState } from '@/app/tools/handlers/resize'

const session = computed(() => resizeSessionState.session)
const size = nodeSizeRef
const position = nodePositionRef
const sizeDelta = computed(() => {
  const s = session.value
  const primaryId = selectedNodeRef.value?.id
  if (!s || !primaryId) return { width: 0, height: 0 }
  const start = s.startLayouts.get(primaryId)
  if (!start) return { width: 0, height: 0 }
  return {
    width: size.value.width - start.width,
    height: size.value.height - start.height,
  }
})

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value - Math.round(value)) < 1e-6) return String(Math.round(value))
  return value.toFixed(1)
}

const titleText = computed(
  () =>
    `size ${formatNumber(size.value.width)}×${formatNumber(size.value.height)} · pos ${formatNumber(position.value.x)}, ${formatNumber(position.value.y)} · Δ ${formatNumber(sizeDelta.value.width)}, ${formatNumber(sizeDelta.value.height)}`
)
</script>

<style scoped>
.tool-session-header {
  display: inline-flex;
  max-width: 100%;
  align-items: baseline;
  gap: 4px;
  overflow: hidden;
  color: #c8d0dc;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
}

.tool-session-header__item {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: 3px;
}

.tool-session-header__k {
  color: #8a8a9a;
  font-weight: 600;
  text-transform: lowercase;
}

.tool-session-header__v {
  overflow: hidden;
  color: #e6e6e6;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-overflow: ellipsis;
}

.tool-session-header__sep {
  color: #666;
  flex-shrink: 0;
}
</style>
