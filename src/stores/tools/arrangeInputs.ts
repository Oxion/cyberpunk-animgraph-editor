import { reactive } from 'vue'

export const arrangeInputsToolState = reactive({
  margin: 80,
  spacing: 120,
})

export const arrangeInputsToolCache = reactive({
  incoming: [] as Array<{ key: string; label: string; selected: boolean }>,
  selectedCount: 0,
})
