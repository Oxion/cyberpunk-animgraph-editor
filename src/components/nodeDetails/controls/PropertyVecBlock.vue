<script setup lang="ts">
import { computed } from 'vue'
import { readNumber } from '../handleDataFields'
import PropertyNumberSlider from './PropertyNumberSlider.vue'

const props = defineProps<{
  label: string
  axes: readonly string[]
  target: Record<string, unknown> | null
  revision?: number
}>()

const emit = defineEmits<{
  change: [payload: { axis: string; value: number }]
}>()

function axisValue(axis: string): number {
  void props.revision
  const obj = props.target
  if (!obj) return 0
  return readNumber(obj[axis]) ?? 0
}

const rows = computed(() =>
  props.axes.map((axis) => ({
    axis,
    value: axisValue(axis),
  }))
)
</script>

<template>
  <div class="prop-list">
    <div class="prop-list__head">{{ label }}</div>
    <div class="flex flex-col gap-1.5 px-2 pb-2">
      <PropertyNumberSlider
        v-for="row in rows"
        :key="row.axis"
        :label="row.axis"
        :model-value="row.value"
        :slider-min="-1"
        :slider-max="1"
        :step="0.01"
        :decimals="3"
        @update:model-value="emit('change', { axis: row.axis, value: $event })"
      />
    </div>
  </div>
</template>
