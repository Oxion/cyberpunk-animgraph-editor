<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: number
    valueMin?: number
    valueMax?: number
    decimals?: number
    disabled?: boolean
  }>(),
  {
    decimals: 2,
    disabled: false,
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const editing = ref(false)
const editText = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const liveValue = ref(props.modelValue)

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
    if (editing.value) return
    liveValue.value = v
  }
)

function formatNumber(n: number, decimals: number): string {
  const factor = Math.pow(10, decimals)
  const rounded = Math.round(n * factor) / factor
  if (Math.abs(rounded - Math.round(rounded)) < Number.EPSILON) {
    return String(Math.round(rounded))
  }
  return rounded.toFixed(decimals).replace(/\.?0+$/, '')
}

function applyHardClamp(n: number): number {
  let v = n
  if (props.valueMin != null) v = Math.max(props.valueMin, v)
  if (props.valueMax != null) v = Math.min(props.valueMax, v)
  return v
}

function roundToDecimals(n: number): number {
  const factor = Math.pow(10, Math.max(props.decimals, 0))
  return Math.round(n * factor) / factor
}

function setValue(n: number) {
  if (props.disabled) return
  const next = applyHardClamp(roundToDecimals(n))
  liveValue.value = next
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}

/** Modifier steps: 1 → Shift 10 → Ctrl+Shift 100 → Alt 0.1 → Shift+Alt 0.01 */
function stepFromModifiers(e: MouseEvent | KeyboardEvent): number {
  if (e.ctrlKey && e.shiftKey) return 100
  if (e.shiftKey && e.altKey) return 0.01
  if (e.altKey) return 0.1
  if (e.shiftKey) return 10
  return 1
}

function stepBy(dir: -1 | 1, e: MouseEvent) {
  if (props.disabled || editing.value) return
  const step = stepFromModifiers(e)
  setValue(liveValue.value + dir * step)
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
  setValue(parsed)
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
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    const dir = e.key === 'ArrowLeft' ? -1 : 1
    const step = stepFromModifiers(e)
    const next = applyHardClamp(roundToDecimals(liveValue.value + dir * step))
    liveValue.value = next
    editText.value = formatNumber(next, props.decimals)
  }
}
</script>

<template>
  <div
    class="prop-chrome"
    :class="{ 'prop-chrome--disabled': disabled }"
  >
    <button
      v-show="!editing"
      type="button"
      class="prop-chrome-side prop-chrome-side--left"
      :disabled="disabled || atValueMin"
      title="Decrease (Shift=10, Ctrl+Shift=100, Alt=0.1, Shift+Alt=0.01)"
      @click="stepBy(-1, $event)"
      @pointerdown.stop
    >
      <ChevronLeftIcon :size="14" />
    </button>

    <button
      v-show="!editing"
      type="button"
      class="flex h-full min-w-0 flex-1 cursor-text items-center justify-between gap-2 self-stretch border-none bg-transparent px-2 text-[11px] leading-[26px] hover:bg-control-hover"
      :aria-label="label"
      :disabled="disabled"
      @click="startEdit"
    >
      <span class="prop-chrome-label">{{ label }}</span>
      <span class="prop-chrome-value">{{ displayValue }}</span>
    </button>

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
      :disabled="disabled || atValueMax"
      title="Increase (Shift=10, Ctrl+Shift=100, Alt=0.1, Shift+Alt=0.01)"
      @click="stepBy(1, $event)"
      @pointerdown.stop
    >
      <ChevronRightIcon :size="14" />
    </button>
  </div>
</template>
