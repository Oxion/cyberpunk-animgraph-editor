<script setup lang="ts">
import { computed } from 'vue'
import { readNumber } from '../handleDataFields'

const props = defineProps<{
  label: string
  axes: readonly string[]
  target: Record<string, unknown> | null
  revision?: number
}>()

const emit = defineEmits<{
  change: [payload: { axis: string; value: number; immediate: boolean }]
}>()

function axisValue(axis: string): number {
  void props.revision
  const obj = props.target
  if (!obj) return 0
  return readNumber(obj[axis]) ?? 0
}

function commit(axis: string, raw: string) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  emit('change', { axis, value: n, immediate: true })
}

const inputs = computed(() =>
  props.axes.map((axis) => ({
    axis,
    value: axisValue(axis),
  }))
)
</script>

<template>
  <div class="prop-chrome gap-1.5 px-2">
    <span class="prop-chrome-muted max-w-[38%] shrink-0">{{ label }}</span>
    <label
      v-for="item in inputs"
      :key="item.axis"
      class="flex h-full min-w-0 flex-1 items-center gap-1 text-[11px] leading-none text-control-label"
    >
      <span class="leading-[26px]">{{ item.axis }}</span>
      <input
        type="number"
        step="0.01"
        class="h-full min-w-0 flex-1 border-none bg-transparent p-0 text-right text-[11px] leading-[26px] text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        :value="item.value"
        :aria-label="`${label} ${item.axis}`"
        @change="commit(item.axis, ($event.target as HTMLInputElement).value)"
        @blur="commit(item.axis, ($event.target as HTMLInputElement).value)"
      >
    </label>
  </div>
</template>
