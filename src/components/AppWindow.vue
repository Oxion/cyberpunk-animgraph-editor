<template>
  <div
    ref="windowRef"
    v-show="!minimized"
    tabindex="0"
    data-diagram-focus-host
    class="app-window absolute flex flex-col overflow-hidden border border-hairline bg-card text-card-foreground outline-none"
    :class="{
      'border-primary': active,
      'border-dashed': preview,
      'rounded-none shadow-none': maximized,
      'rounded-sm shadow-md shadow-black/40': !maximized,
    }"
    :style="windowStyle"
    @pointerdown="onWindowPointerDown"
    @focus="emit('key-focus')"
    @blur="onWindowBlur"
  >
    <header
      class="app-window__header flex shrink-0 items-center justify-between gap-2 border-b border-border bg-panel-header px-2 py-1 select-none"
      :class="maximized ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'"
      @pointerdown="onDragStart"
      @dblclick.stop="emit('maximize')"
    >
      <span class="min-w-0 flex-1 truncate text-xs text-foreground" :title="title">
        <span
          v-if="preview"
          class="mr-1.5 inline-block align-middle rounded-sm bg-secondary px-1 py-px text-[10px] text-muted-foreground"
        >
          Preview
        </span>
        {{ title }}
      </span>
      <div class="ml-auto flex shrink-0 items-center gap-0.5">
        <slot name="toolbar-actions" />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Minimize"
          @pointerdown.stop
          @click="emit('minimize')"
        >
          ─
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          class="rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="maximized ? 'Restore' : 'Maximize'"
          @pointerdown.stop
          @click="emit('maximize')"
        >
          {{ maximized ? '❐' : '□' }}
        </Button>
        <Button
          v-if="closable"
          type="button"
          variant="ghost"
          size="icon-xs"
          class="rounded-sm text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          title="Close"
          @pointerdown.stop
          @click="emit('close')"
        >
          ×
        </Button>
      </div>
    </header>
    <div class="flex min-h-0 flex-1 flex-col bg-card">
      <slot />
    </div>
    <div
      v-if="!maximized"
      class="absolute right-0 bottom-0 z-2 size-4 cursor-nwse-resize"
      title="Resize"
      @pointerdown.stop="onResizeStart"
    >
      <span class="absolute right-0.5 bottom-0.5 size-2 border-r border-b border-hairline" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { isFocusLeavingHost } from '../utils/dom/focusDiagramHost'

const props = defineProps<{
  title: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  minimized: boolean
  maximized?: boolean
  preview?: boolean
  active?: boolean
  closable?: boolean
}>()

const closable = computed(() => props.closable !== false)

const windowStyle = computed(() => {
  if (props.maximized) {
    return {
      left: '0px',
      top: '0px',
      width: '100%',
      height: '100%',
      zIndex: props.zIndex,
    }
  }
  return {
    left: `${props.x}px`,
    top: `${props.y}px`,
    width: `${props.width}px`,
    height: `${props.height}px`,
    zIndex: props.zIndex,
  }
})

const emit = defineEmits<{
  close: []
  focus: []
  'key-focus': []
  'key-blur': []
  minimize: []
  maximize: []
  'update:rect': [rect: { x: number; y: number; width: number; height: number }]
  resized: []
}>()

const MIN_WIDTH = 280
const MIN_HEIGHT = 180
const MAX_WIDTH = 1600
const MAX_HEIGHT = 1200
const FALLBACK_HEADER_HEIGHT = 38

const windowRef = ref<HTMLElement | null>(null)

const onWindowPointerDown = () => {
  emit('focus')
  windowRef.value?.focus({ preventScroll: true })
}

const onWindowBlur = (event: FocusEvent) => {
  if (!isFocusLeavingHost(event, windowRef.value)) return
  emit('key-blur')
}

let dragPointerId: number | null = null
let dragOffset = { x: 0, y: 0 }
let dragLayer: HTMLElement | null = null

let resizePointerId: number | null = null
let resizeStart = { width: 0, height: 0, pointerX: 0, pointerY: 0, x: 0, y: 0 }

const getLayer = (): HTMLElement | null => {
  return windowRef.value?.closest('.app-windows-layer') as HTMLElement | null
}

const getHeaderHeight = (): number => {
  const header = windowRef.value?.querySelector('.app-window__header') as HTMLElement | null
  return header?.offsetHeight ?? FALLBACK_HEADER_HEIGHT
}

const clampPosition = (x: number, y: number, width: number): { x: number; y: number } => {
  const layer = getLayer()
  if (!layer) {
    return { x: Math.max(0, x), y: Math.max(0, y) }
  }

  const layerW = layer.clientWidth
  const layerH = layer.clientHeight
  const headerH = getHeaderHeight()
  const maxY = Math.max(0, layerH - headerH)
  const minX = layerW < width ? layerW - width : 0
  const maxX = Math.max(0, layerW - width)

  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(0, y)),
  }
}

const onDragStart = (e: PointerEvent) => {
  if (e.button !== 0 || props.maximized) return
  dragLayer = getLayer()
  if (!dragLayer) return

  const layerRect = dragLayer.getBoundingClientRect()
  dragPointerId = e.pointerId
  dragOffset = {
    x: e.clientX - layerRect.left - props.x,
    y: e.clientY - layerRect.top - props.y,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
  emit('focus')
}

const onDragMove = (e: PointerEvent) => {
  if (dragPointerId !== e.pointerId || !dragLayer) return
  const layerRect = dragLayer.getBoundingClientRect()
  const rawX = e.clientX - layerRect.left - dragOffset.x
  const rawY = e.clientY - layerRect.top - dragOffset.y
  const { x, y } = clampPosition(rawX, rawY, props.width)
  emit('update:rect', {
    x,
    y,
    width: props.width,
    height: props.height,
  })
}

const onDragEnd = (e: PointerEvent) => {
  if (dragPointerId !== e.pointerId) return
  dragPointerId = null
  dragLayer = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
}

const onResizeStart = (e: PointerEvent) => {
  if (e.button !== 0 || props.maximized) return
  resizePointerId = e.pointerId
  resizeStart = {
    width: props.width,
    height: props.height,
    pointerX: e.clientX,
    pointerY: e.clientY,
    x: props.x,
    y: props.y,
  }
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', onResizeEnd)
  window.addEventListener('pointercancel', onResizeEnd)
  emit('focus')
}

const onResizeMove = (e: PointerEvent) => {
  if (resizePointerId !== e.pointerId) return
  const dw = e.clientX - resizeStart.pointerX
  const dh = e.clientY - resizeStart.pointerY
  const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, resizeStart.width + dw))
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, resizeStart.height + dh))
  const { x, y } = clampPosition(resizeStart.x, resizeStart.y, width)
  emit('update:rect', { x, y, width, height })
}

const onResizeEnd = (e: PointerEvent) => {
  if (resizePointerId !== e.pointerId) return
  resizePointerId = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', onResizeEnd)
  window.removeEventListener('pointercancel', onResizeEnd)
  emit('resized')
}
</script>
