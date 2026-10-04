import { reactive } from 'vue'
import type { NodeTypeOption } from '../../components/tools/NodeTypePicker.vue'

export const addNodeToolState = reactive({
  draftNodeId: '',
  selectedTypeKey: '',
  idMode: 'auto' as 'auto' | 'manual',
})

export const addNodeToolCache = reactive({
  targetLabel: '—',
  addableTypes: [] as NodeTypeOption[],
  gateMessage: '',
})
