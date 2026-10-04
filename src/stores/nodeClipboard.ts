import { shallowRef } from 'vue'
import type { NodeClipboard } from '../utils/graph/pasteClipboard'

export const nodeClipboard = shallowRef<NodeClipboard | null>(null)
