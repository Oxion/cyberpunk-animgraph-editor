import { reactive } from 'vue'

export const attachHandleToolState = reactive({
  actionNodeId: null as string | null,
})

export const attachHandleToolCache = reactive({
  hasSelection: false,
  actionNodeId: null as string | null,
})
