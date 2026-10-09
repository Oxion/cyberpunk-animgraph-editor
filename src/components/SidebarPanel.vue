<template>
  <section
    class="sidebar-panel sidebar-card"
    :class="{
      'sidebar-panel--collapsed': collapsed && !headerOnly,
      'sidebar-panel--fill': fill && !collapsed && !headerOnly,
      'sidebar-panel--resizing': resizing,
      'sidebar-panel--header-only': headerOnly,
    }"
    :style="panelStyle"
  >
    <header
      class="sidebar-panel__header"
      @dblclick="onHeaderDblclick"
    >
      <slot name="leading">
        <button
          v-if="!headerOnly"
          type="button"
          class="sidebar-panel__collapse"
          :title="collapsed ? 'Expand' : 'Collapse'"
          @click="toggleCollapsed"
        >
          <ChevronDown v-if="!collapsed" :size="14" />
          <ChevronRight v-else :size="14" />
        </button>
      </slot>
      <h3 class="sidebar-panel__title">{{ title }}</h3>
      <div v-if="$slots.header" class="sidebar-panel__header-end" @click.stop>
        <slot name="header" />
      </div>
      <button
        v-if="closable"
        type="button"
        class="sidebar-panel__close"
        title="Close"
        @click="emit('close')"
      >
        ×
      </button>
    </header>

    <div
      v-if="!headerOnly && !collapsed && $slots.subheader"
      class="sidebar-panel__subheader"
      @click.stop
    >
      <slot name="subheader" />
    </div>

    <div v-if="!headerOnly" v-show="!collapsed" class="sidebar-panel__body">
      <div class="sidebar-panel__body-inner">
        <slot />
      </div>
    </div>

    <div
      v-if="!headerOnly && !collapsed && !fill"
      class="sidebar-panel__resize"
      title="Resize panel"
      @pointerdown="onResizeStart"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

const HEADER_HEIGHT = 32

const props = withDefaults(
  defineProps<{
    title: string
    collapsed?: boolean
    /** Expanded panel height including header + resize handle. Ignored when fill. */
    height?: number
    minHeight?: number
    maxHeight?: number
    /** Stretch to consume remaining sidebar space (last expanded panel). */
    fill?: boolean
    closable?: boolean
    /** Header row only — no body, collapse, or resize. */
    headerOnly?: boolean
  }>(),
  {
    collapsed: false,
    height: 240,
    minHeight: 120,
    maxHeight: 800,
    fill: false,
    closable: false,
    headerOnly: false,
  }
)

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  'update:height': [value: number]
  close: []
}>()

const resizing = ref(false)
let pointerId: number | null = null
let startY = 0
let startHeight = 0

const clampHeight = (value: number) =>
  Math.min(props.maxHeight, Math.max(props.minHeight, value))

const panelStyle = computed(() => {
  if (props.headerOnly || props.collapsed) {
    return { height: `${HEADER_HEIGHT}px` }
  }
  if (props.fill) {
    return { minHeight: `${Math.max(HEADER_HEIGHT, props.minHeight)}px` }
  }
  return { height: `${clampHeight(props.height)}px` }
})

const toggleCollapsed = () => {
  if (props.headerOnly) return
  emit('update:collapsed', !props.collapsed)
}

const onHeaderDblclick = () => {
  toggleCollapsed()
}

const endResize = (e: PointerEvent) => {
  if (pointerId !== e.pointerId) return
  pointerId = null
  resizing.value = false
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', endResize)
  document.removeEventListener('pointercancel', endResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

const onResizeMove = (e: PointerEvent) => {
  if (pointerId !== e.pointerId) return
  const delta = e.clientY - startY
  emit('update:height', clampHeight(startHeight + delta))
}

const onResizeStart = (e: PointerEvent) => {
  if (props.headerOnly || props.collapsed || props.fill) return
  e.preventDefault()
  e.stopPropagation()
  pointerId = e.pointerId
  resizing.value = true
  startY = e.clientY
  startHeight = clampHeight(props.height)
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', endResize)
  document.addEventListener('pointercancel', endResize)
  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
}

defineExpose({ HEADER_HEIGHT })
</script>

<style scoped>
.sidebar-panel {
  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid #1f1f1f;
  border-radius: var(--radius-sm);
  background: #303030;
}

.sidebar-panel--fill {
  flex: 1 0 0;
  /* Keep at least minHeight from inline style; do not shrink under siblings. */
  min-height: 0;
}

.sidebar-panel__header {
  display: flex;
  height: 32px;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border-bottom: 1px solid #1f1f1f;
  background: #383838;
  user-select: none;
}

.sidebar-panel--collapsed .sidebar-panel__header,
.sidebar-panel--header-only .sidebar-panel__header {
  border-bottom: none;
}

.sidebar-panel__collapse,
.sidebar-panel__close {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: #999999;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.sidebar-panel__collapse:hover,
.sidebar-panel__close:hover {
  background: #3e3e3e;
  color: #e6e6e6;
}

.sidebar-panel__close {
  font-size: 16px;
}

.sidebar-panel__title {
  margin: 0;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: #e6e6e6;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-panel__header-end {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}

.sidebar-panel__subheader {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  align-items: stretch;
  padding: 0;
  border-bottom: 1px solid #1f1f1f;
  background: #383838;
}

.sidebar-panel__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px 12px;
  background: #303030;
  color: #e6e6e6;
}

.sidebar-panel__body-inner {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  gap: 8px;
  min-height: min-content;
}

@media (max-width: 768px) {
  .sidebar-panel__resize {
    display: none;
  }
}

.sidebar-panel__resize {
  flex-shrink: 0;
  height: 6px;
  cursor: ns-resize;
  background: transparent;
  transition: background 0.15s ease;
}

.sidebar-panel__resize:hover,
.sidebar-panel--resizing .sidebar-panel__resize {
  background: rgba(71, 114, 179, 0.35);
}
</style>
