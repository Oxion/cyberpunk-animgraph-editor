import {
  fieldTypeName,
  generateDataTemplate,
  getAnimTypeFields,
  isArrayFieldType,
} from '../../utils/animFieldSchema'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function isIndexSeg(seg: string): boolean {
  return String(Number(seg)) === seg && Number.isInteger(Number(seg)) && Number(seg) >= 0
}

/** Walk `path` on a typed object, creating missing structs/arrays from the type registry. */
export function applyStructPath(
  root: Record<string, unknown>,
  path: string[],
  value: unknown,
  typeName: string
): void {
  if (path.length === 0) return
  let cursor: unknown = root
  let currentType = typeName
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]
    if (Array.isArray(cursor) && isIndexSeg(seg)) {
      const index = Number(seg)
      let el = cursor[index]
      if (!el || typeof el !== 'object' || Array.isArray(el)) {
        el = generateDataTemplate(currentType) ?? { $type: currentType }
        cursor[index] = el
      }
      cursor = el
      continue
    }
    const obj = asRecord(cursor)
    if (!obj) return
    const field = getAnimTypeFields(currentType).find((f) => f.key === seg)
    const childType = field ? fieldTypeName(field.type) : seg
    if (field && isArrayFieldType(field.type)) {
      if (!Array.isArray(obj[seg])) obj[seg] = []
      cursor = obj[seg]
      currentType = childType
      continue
    }
    let next = asRecord(obj[seg])
    if (!next) {
      next = generateDataTemplate(childType) ?? { $type: childType }
      obj[seg] = next
    }
    cursor = next
    currentType = childType
  }
  const last = path[path.length - 1]
  if (Array.isArray(cursor) && isIndexSeg(last)) {
    cursor[Number(last)] = value
    return
  }
  const obj = asRecord(cursor)
  if (obj) obj[last] = value
}
