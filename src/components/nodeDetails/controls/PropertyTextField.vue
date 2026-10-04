<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string
    disabled?: boolean
    placeholder?: string
  }>(),
  {
    disabled: false,
    placeholder: '',
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const local = ref(props.modelValue)

watch(
  () => props.modelValue,
  (v) => {
    local.value = v
  }
)

function commit() {
  if (props.disabled) return
  const next = local.value
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    ;(e.target as HTMLInputElement).blur()
  } else if (e.key === 'Escape') {
    local.value = props.modelValue
    ;(e.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <label
    class="prop-chrome gap-2 px-2"
    :class="{ 'prop-chrome--disabled': disabled }"
  >
    <span class="prop-chrome-muted max-w-[42%] shrink-0">{{ label }}</span>
    <input
      v-model="local"
      type="text"
      class="h-full min-w-0 flex-1 border-none bg-transparent p-0 text-right text-[11px] leading-[26px] text-foreground outline-none placeholder:text-muted-foreground"
      :disabled="disabled"
      :placeholder="placeholder"
      :aria-label="label"
      @keydown="onKeydown"
      @blur="commit"
      @change="commit"
    >
  </label>
</template>
