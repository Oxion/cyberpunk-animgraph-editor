<script setup lang="ts">
import { CheckIcon } from 'lucide-vue-next'

const props = defineProps<{
  label: string
  modelValue: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function toggle() {
  if (props.disabled) return
  emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <button
    type="button"
    class="prop-chrome text-left"
    :class="{
      'prop-chrome--disabled': disabled,
      'prop-chrome--on': modelValue,
    }"
    :disabled="disabled"
    :aria-pressed="modelValue"
    :aria-label="label"
    @click="toggle"
  >
    <span class="prop-chrome-label min-w-0 flex-1 px-2">{{ label }}</span>
    <span
      class="prop-chrome-side prop-chrome-side--right"
      aria-hidden="true"
    >
      <span
        class="flex size-full items-center justify-center"
        :class="modelValue ? 'bg-primary' : 'bg-canvas'"
      >
        <CheckIcon
          v-if="modelValue"
          class="shrink-0 text-primary-foreground"
          :size="12"
          :stroke-width="2.5"
        />
      </span>
    </span>
  </button>
</template>
