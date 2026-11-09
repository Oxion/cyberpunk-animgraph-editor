/**
 * Blank pin-array slot prototypes (no mutation side effects).
 */

import { NodeDefinitionRegistry } from '../NodeDefinition'
import {
  generateArrayElementTemplate,
  getAnimTypeFields,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
} from '../animFieldSchema'
import type { AnimgraphNode } from './animgraphTypes'

/** Deep-clone a blank array slot for `inputName` (from types, dataTemplate, or existing slots). */
export function createBlankInputArraySlot(
  handle: AnimgraphNode,
  inputName: string,
  nodeType: string
): unknown {
  const fromType = generateArrayElementTemplate(nodeType, inputName)
  const template = NodeDefinitionRegistry.getHandleTypeDataTemplate(nodeType)?.[inputName]
  let prototype: unknown = fromType
  if (!prototype) {
    if (Array.isArray(template) && template.length > 0) {
      prototype = template[0]
    } else if (template && typeof template === 'object' && !Array.isArray(template)) {
      prototype = template
    } else {
      const existing = handle.Data?.[inputName]
      if (Array.isArray(existing) && existing.length > 0) {
        prototype = existing[0]
      }
    }
  }

  if (prototype && typeof prototype === 'object') {
    const clone = structuredClone(prototype) as Record<string, unknown>
    if ('node' in clone) clone.node = null
    if ('HandleRefId' in clone) delete clone.HandleRefId
    if ('HandleId' in clone) delete clone.HandleId
    return clone
  }

  const fieldDef = getAnimTypeFields(nodeType).find((f) => f.key === inputName)
  if (fieldDef && isArrayFieldType(fieldDef.type)) {
    const inner = fieldDef.type.array
    if (isRefFieldType(inner) || isWrefFieldType(inner)) {
      return null
    }
  }

  return { $type: 'animPoseLink', node: null }
}
