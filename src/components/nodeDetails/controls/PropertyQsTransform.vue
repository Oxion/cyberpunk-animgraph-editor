<script setup lang="ts">
import PropertyVecBlock from './PropertyVecBlock.vue'

const XYZ = ['X', 'Y', 'Z'] as const
const IJKR = ['i', 'j', 'k', 'r'] as const

const props = defineProps<{
  label?: string
  modelValue: Record<string, unknown> | null
  revision?: number
}>()

const emit = defineEmits<{
  change: [payload: { path: string[]; value: unknown; immediate: boolean }]
}>()

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function child(key: string): Record<string, unknown> | null {
  return asRecord(props.modelValue?.[key])
}

function onVec(prefix: string, payload: { axis: string; value: number }) {
  emit('change', {
    path: [prefix, payload.axis],
    value: payload.value,
    immediate: false,
  })
}
</script>

<template>
  <details class="prop-list">
    <summary class="cursor-pointer select-none px-2 py-1 text-xs text-muted-foreground">
      {{ label ?? 'QsTransform' }}
    </summary>
    <div class="flex flex-col gap-1.5 px-2 pb-2">
      <PropertyVecBlock
        label="Translation"
        :axes="XYZ"
        :target="child('Translation')"
        :revision="revision"
        @change="onVec('Translation', $event)"
      />
      <PropertyVecBlock
        label="Rotation"
        :axes="IJKR"
        :target="child('Rotation')"
        :revision="revision"
        @change="onVec('Rotation', $event)"
      />
      <PropertyVecBlock
        label="Scale"
        :axes="XYZ"
        :target="child('Scale')"
        :revision="revision"
        @change="onVec('Scale', $event)"
      />
    </div>
  </details>
</template>
