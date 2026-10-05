<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: number
    /**
     * Hard value clamps (input / arrows / commits).
     * Omit to allow any finite number from text input.
     */
    valueMin?: number
    valueMax?: number
    /**
     * Slider track + drag range. Falls back to legacy `min`/`max`, then 0/1.
     */
    sliderMin?: number
    sliderMax?: number
    step?: number
    decimals?: number
    disabled?: boolean
  }>(),
  {
    step: 0.01,
    decimals: 3,
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const trackRef = ref<HTMLElement | null>(null)
const editing = ref(false)
const editText = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

/** Optimistic value while dragging / before parent re-renders. */
const liveValue = ref(props.modelValue)

const pointerStartX = ref(0)
const pointerMoved = ref(false)
const DRAG_THRESHOLD_PX = 3

const trackMin = computed(() => props.sliderMin ?? 0)
const trackMax = computed(() => props.sliderMax ?? 1)

/** Frozen track while dragging so parent re-renders can't rescale the mapping mid-gesture. */
const dragTrackMin = ref<number | null>(null)
const dragTrackMax = ref<number | null>(null)

const activeTrackMin = computed(() => dragTrackMin.value ?? trackMin.value)
const activeTrackMax = computed(() => dragTrackMax.value ?? trackMax.value)
const trackRange = computed(() =>
  Math.max(activeTrackMax.value - activeTrackMin.value, Number.EPSILON)
)

const fillPercent = computed(() => {
  const t = (liveValue.value - activeTrackMin.value) / trackRange.value
  return clamp(t * 100, 0, 100)
})

const displayValue = computed(() => formatNumber(liveValue.value, props.decimals))

const atValueMin = computed(
  () => props.valueMin != null && liveValue.value <= props.valueMin
)
const atValueMax = computed(
  () => props.valueMax != null && liveValue.value >= props.valueMax
)

watch(
  () => props.modelValue,
  (v) => {
    if (dragging.value || editing.value) return
    liveValue.value = v
  }
)

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function formatNumber(n: number, decimals: number): string {
  return n.toFixed(decimals)
}

function applyHardClamp(n: number): number {
  let v = n
  if (props.valueMin != null) v = Math.max(props.valueMin, v)
  if (props.valueMax != null) v = Math.min(props.valueMax, v)
  return v
}

function quantizeToStep(n: number, origin: number): number {
  const step = props.step > 0 ? props.step : 0.001
  const raw = Math.round((n - origin) / step) * step + origin
  const factor = Math.pow(10, Math.max(props.decimals, 6))
  return Math.round(raw * factor) / factor
}

/** Slider drag: quantize + clamp to track range, then optional hard clamp. */
function setValueFromSlider(n: number) {
  if (props.disabled) return
  const min = activeTrackMin.value
  const max = activeTrackMax.value
  const quantized = quantizeToStep(n, min)
  const next = applyHardClamp(clamp(quantized, min, max))
  liveValue.value = next
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}

/** Input / arrows: quantize to step, hard-clamp only (may exceed slider track). */
function setValueFromInput(n: number) {
  if (props.disabled) return
  const quantized = quantizeToStep(n, 0)
  const next = applyHardClamp(quantized)
  liveValue.value = next
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}

function valueFromClientX(clientX: number) {
  const el = trackRef.value
  if (!el) return liveValue.value
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0) return liveValue.value
  const t = clamp((clientX - rect.left) / rect.width, 0, 1)
  return activeTrackMin.value + t * trackRange.value
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled || editing.value) return
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('[data-slider-arrow]')) return

  e.preventDefault()
  pointerStartX.value = e.clientX
  pointerMoved.value = false
  dragging.value = false
  dragTrackMin.value = trackMin.value
  dragTrackMax.value = trackMax.value
  trackRef.value?.setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (props.disabled || editing.value) return
  if (!(e.buttons & 1)) return
  if (!trackRef.value?.hasPointerCapture(e.pointerId) && !dragging.value) return

  const dx = Math.abs(e.clientX - pointerStartX.value)
  if (!pointerMoved.value && dx < DRAG_THRESHOLD_PX) return

  pointerMoved.value = true
  dragging.value = true
  setValueFromSlider(valueFromClientX(e.clientX))
}

function onPointerUp(e: PointerEvent) {
  if (props.disabled) return
  const wasCapturing = trackRef.value?.hasPointerCapture(e.pointerId)
  try {
    trackRef.value?.releasePointerCapture(e.pointerId)
  } catch {
    /* already released */
  }

  dragTrackMin.value = null
  dragTrackMax.value = null

  if (editing.value) return
  if (!wasCapturing && !dragging.value && !pointerMoved.value) return

  if (dragging.value || pointerMoved.value) {
    dragging.value = false
    pointerMoved.value = false
    return
  }

  void startEdit()
}

function stepBy(dir: -1 | 1) {
  if (props.disabled || editing.value) return
  setValueFromInput(liveValue.value + dir * props.step)
}

async function startEdit() {
  if (props.disabled) return
  editing.value = true
  editText.value = displayValue.value
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
}

function commitEdit() {
  if (!editing.value) return
  const parsed = Number(String(editText.value).trim().replace(',', '.'))
  editing.value = false
  if (!Number.isFinite(parsed)) {
    liveValue.value = props.modelValue
    return
  }
  setValueFromInput(parsed)
}

function cancelEdit() {
  editing.value = false
  liveValue.value = props.modelValue
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitEdit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEdit()
  }
}
</script>

<template>
  <div
    class="prop-chrome"
    :class="{
      'prop-chrome--disabled': disabled,
      'prop-num-slider--out-of-track': liveValue < trackMin || liveValue > trackMax,
    }"
  >
    <button
      v-show="!editing"
      type="button"
      class="prop-chrome-side prop-chrome-side--left"
      data-slider-arrow
      :disabled="disabled || atValueMin"
      :title="`Decrease by ${step}`"
      @click="stepBy(-1)"
      @pointerdown.stop
    >
      <ChevronLeftIcon :size="14" />
    </button>

    <div
      v-show="!editing"
      ref="trackRef"
      class="prop-num-slider__track"
      role="slider"
      :aria-valuemin="trackMin"
      :aria-valuemax="trackMax"
      :aria-valuenow="liveValue"
      :aria-label="label"
      :aria-disabled="disabled || undefined"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <div class="prop-chrome-fill" :style="{ width: `${fillPercent}%` }" />
      <div class="pointer-events-none relative z-[1] flex h-full items-center justify-between gap-2 px-2 text-[11px] leading-[26px]">
        <span class="prop-chrome-label">{{ label }}</span>
        <span class="prop-chrome-value prop-num-slider__value">{{ displayValue }}</span>
      </div>
    </div>

    <input
      v-if="editing"
      ref="inputRef"
      v-model="editText"
      type="text"
      inputmode="decimal"
      class="h-full min-w-0 flex-1 border-none bg-secondary px-2 text-left text-[11px] leading-[26px] text-foreground tabular-nums outline-none focus:bg-canvas"
      :aria-label="label"
      @keydown="onEditKeydown"
      @blur="commitEdit"
      @pointerdown.stop
    >

    <button
      v-show="!editing"
      type="button"
      class="prop-chrome-side prop-chrome-side--right"
      data-slider-arrow
      :disabled="disabled || atValueMax"
      :title="`Increase by ${step}`"
      @click="stepBy(1)"
      @pointerdown.stop
    >
      <ChevronRightIcon :size="14" />
    </button>
  </div>
</template>

<style scoped>
.prop-num-slider__track {
  position: relative;
  flex: 1 1 auto;
  align-self: stretch;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  cursor: ew-resize;
  touch-action: none;
}

.prop-num-slider--out-of-track .prop-chrome-fill {
  background: color-mix(in srgb, var(--warning) 45%, transparent);
}

.prop-num-slider--out-of-track .prop-num-slider__value {
  color: var(--warning-foreground);
  background: var(--warning);
  border-radius: 2px;
  padding: 0 5px;
  font-weight: 600;
  line-height: 18px;
}
</style>
