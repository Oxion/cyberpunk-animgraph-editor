<script setup lang="ts">
const props = defineProps<{
  label: string
  modelValue: string
  options: readonly string[]
  /** Display text per option value. Falls back to the value. */
  optionLabels?: Readonly<Record<string, string>>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onChange(e: Event) {
  if (props.disabled) return
  const next = (e.target as HTMLSelectElement).value
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}
</script>

<template>
  <label
    class="prop-chrome cursor-pointer"
    :class="{ 'prop-chrome--disabled': disabled }"
  >
    <span class="prop-chrome-label min-w-0 flex-1 px-2">{{ label }}</span>
    <select
      class="prop-enum-select"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="label"
      @change="onChange"
    >
      <option
        v-for="opt in options"
        :key="opt || 'none'"
        :value="opt"
      >
        {{ optionLabels?.[opt] ?? (opt || 'none') }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.prop-enum-select {
  flex: 0 1 auto;
  align-self: stretch;
  max-width: 55%;
  min-width: 5.5rem;
  height: 100%;
  margin: 0;
  padding: 0 22px 0 8px;
  border: none;
  border-left: 1px solid var(--control-edge);
  border-radius: 0;
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b3b3b3' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  color: var(--foreground);
  font: inherit;
  font-size: 11px;
  line-height: 26px;
  text-align: right;
  outline: none;
  appearance: none;
  cursor: pointer;
}

.prop-enum-select:hover {
  background-color: var(--control-hover);
}

.prop-enum-select option {
  background: var(--canvas);
  color: var(--foreground);
  text-align: left;
}
</style>
