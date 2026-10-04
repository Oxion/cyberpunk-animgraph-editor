import type { NodeChildHandler } from './handlers'
import type { FieldConstraint } from './types'

const OUTPUT_TYPE = 'animAnimNode_Output'

export const outputFirstChildHandler: NodeChildHandler = {
  ensureOrder(handlesRegistry, node, propName) {
    const nodes = node.Data[propName] as Array<{ HandleId?: string; HandleRefId?: string }> | undefined
    if (!nodes || !Array.isArray(nodes)) return

    nodes.sort((a, b) => {
      const aHandle = handlesRegistry.get(
        'HandleRefId' in a && a.HandleRefId ? a.HandleRefId : (a.HandleId ?? '')
      )
      const bHandle = handlesRegistry.get(
        'HandleRefId' in b && b.HandleRefId ? b.HandleRefId : (b.HandleId ?? '')
      )
      const aSort = aHandle && aHandle.Data.$type === OUTPUT_TYPE ? 0 : 1
      const bSort = bHandle && bHandle.Data.$type === OUTPUT_TYPE ? 0 : 1
      return aSort - bSort
    })
  },
}

export function childHandlerForOrder(
  order: FieldConstraint['order']
): NodeChildHandler | undefined {
  if (order === 'output-first') return outputFirstChildHandler
  return undefined
}
