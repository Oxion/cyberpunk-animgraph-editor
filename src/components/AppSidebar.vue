<template>
  <aside
    :ref="setSidebarEl"
    class="sidebar"
    :class="{ 'sidebar--resizing': sidebarResizing }"
    :style="sidebarStyle"
  >
    <div
      class="sidebar-resize-handle"
      title="Resize sidebar"
      :style="resizeHandleStyle"
      @pointerdown="onSidebarResizeStart"
    />
    <div :ref="setSidebarCardsEl" class="sidebar-cards">
      <slot />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch, type ComponentPublicInstance } from 'vue'

defineProps<{
  sidebarResizing: boolean
  sidebarStyle: Record<string, string>
  onSidebarResizeStart: (e: PointerEvent) => void
}>()

const sidebarEl = defineModel<HTMLElement | null>('sidebarEl', { default: null })
const sidebarCardsEl = defineModel<HTMLElement | null>('sidebarCardsEl', { default: null })

const resizeHandleTop = ref(0)
const resizeHandleHeight = ref(0)

const resizeHandleStyle = computed(() => ({
  top: `${resizeHandleTop.value}px`,
  height: `${resizeHandleHeight.value}px`,
}))

const asHtmlEl = (el: Element | ComponentPublicInstance | null): HTMLElement | null => {
  if (!el) return null
  if (el instanceof HTMLElement) return el
  return null
}

/** Prefer a laid-out box; skip display:contents / zero-size wrappers. */
const measureBoxEl = (el: HTMLElement): HTMLElement => {
  const rect = el.getBoundingClientRect()
  if (rect.height > 0 || rect.width > 0) return el
  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) return measureBoxEl(child)
  }
  return el
}

const measureResizeHandle = () => {
  const sidebar = sidebarEl.value
  const cards = sidebarCardsEl.value
  if (!sidebar || !cards) {
    resizeHandleTop.value = 0
    resizeHandleHeight.value = 0
    return
  }

  const kids = Array.from(cards.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  )
  if (kids.length === 0) {
    resizeHandleTop.value = 0
    resizeHandleHeight.value = 0
    return
  }

  const sidebarRect = sidebar.getBoundingClientRect()
  const firstRect = measureBoxEl(kids[0]).getBoundingClientRect()
  const lastRect = measureBoxEl(kids[kids.length - 1]).getBoundingClientRect()

  resizeHandleTop.value = Math.max(0, firstRect.top - sidebarRect.top)
  resizeHandleHeight.value = Math.max(0, lastRect.bottom - firstRect.top)
}

let cardsObserver: ResizeObserver | null = null
let cardsMutationObserver: MutationObserver | null = null
let childObservers: ResizeObserver[] = []

const disconnectChildObservers = () => {
  for (const observer of childObservers) observer.disconnect()
  childObservers = []
}

const observeCards = (cards: HTMLElement | null) => {
  cardsObserver?.disconnect()
  cardsObserver = null
  cardsMutationObserver?.disconnect()
  cardsMutationObserver = null
  disconnectChildObservers()
  if (!cards) {
    resizeHandleTop.value = 0
    resizeHandleHeight.value = 0
    return
  }

  const syncChildren = () => {
    disconnectChildObservers()
    for (const child of Array.from(cards.children)) {
      if (!(child instanceof HTMLElement)) continue
      const target = measureBoxEl(child)
      const childObserver = new ResizeObserver(() => measureResizeHandle())
      childObserver.observe(target)
      if (target !== child) {
        childObserver.observe(child)
      }
      childObservers.push(childObserver)
    }
    measureResizeHandle()
  }

  cardsObserver = new ResizeObserver(() => measureResizeHandle())
  cardsObserver.observe(cards)
  cardsMutationObserver = new MutationObserver(syncChildren)
  cardsMutationObserver.observe(cards, { childList: true })
  syncChildren()
}

const setSidebarEl = (el: Element | ComponentPublicInstance | null) => {
  sidebarEl.value = asHtmlEl(el)
  measureResizeHandle()
}

const setSidebarCardsEl = (el: Element | ComponentPublicInstance | null) => {
  const cards = asHtmlEl(el)
  sidebarCardsEl.value = cards
  observeCards(cards)
}

watch(sidebarEl, () => measureResizeHandle())

onBeforeUnmount(() => {
  cardsObserver?.disconnect()
  cardsObserver = null
  cardsMutationObserver?.disconnect()
  cardsMutationObserver = null
  disconnectChildObservers()
})
</script>

<style scoped>
.sidebar {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: var(--sidebar-width, 480px);
  max-width: calc(100% - 24px);
  z-index: 15;
  background: transparent;
  border: none;
  padding: 12px;
  overflow: hidden;
  pointer-events: none;
  display: flex;
  flex-direction: column;
}

.sidebar-resize-handle {
  position: absolute;
  left: 0;
  width: 8px;
  margin-left: -4px;
  cursor: ew-resize;
  pointer-events: auto;
  z-index: 2;
}

.sidebar-resize-handle:hover,
.sidebar--resizing .sidebar-resize-handle {
  background: rgba(71, 114, 179, 0.28);
}

.sidebar-cards {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow: hidden;
  /* Empty area below panels must not block the graph. */
  pointer-events: none;
}

.sidebar-cards > :deep(*) {
  pointer-events: auto;
}

@media (max-width: 768px) {
  .sidebar {
    top: auto;
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto !important;
    max-height: 45%;
    overflow-y: auto;
  }

  .sidebar-resize-handle {
    display: none;
  }
}
</style>
