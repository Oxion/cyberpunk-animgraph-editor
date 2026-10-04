import { reactive } from 'vue'
import type { ArrangeSelectionAlgorithm } from '../../utils/graph/ElkGraphLayout'

export const arrangeSelectionToolState = reactive({
  algorithm: 'tidy-tree' as ArrangeSelectionAlgorithm,
  layeredMode: 'flat' as 'flat' | 'compound',
  nodeSpacing: 40,
  layerSpacing: 80,
  forceIterations: 300,
})

export const arrangeSelectionToolCache = reactive({
  anchorId: null as string | null,
  busy: false,
})
