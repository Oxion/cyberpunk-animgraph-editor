/**
 * Animgraph type registry: lookup, parent walk, cached inherited fields.
 */

import { ANIMGRAPH_TYPE_DEFINITIONS } from './definitions'
import type { AnimFieldDef, AnimTypeDef } from './types'
import { isWrefFieldType } from './fieldType'

const types: Record<string, AnimTypeDef> = {
  ...ANIMGRAPH_TYPE_DEFINITIONS,
}

const fieldsCache = new Map<string, readonly AnimFieldDef[]>()

function invalidateCaches(): void {
  fieldsCache.clear()
}

export const AnimTypes: Record<string, AnimTypeDef> = types

export function registerAnimType(name: string, def: AnimTypeDef): void {
  types[name] = def
  invalidateCaches()
}

export function resolveAnimType(typeName: string): AnimTypeDef | null {
  return types[typeName] ?? null
}

export function getAnimTypeParent(typeName: string): string | null {
  const def = resolveAnimType(typeName)
  if (!def) return null
  if (def.kind === 'class' || def.kind === 'struct') return def.parent ?? null
  return null
}

/** Walk `parent` chain. `isAnimType('animAnimNode_FloatValue', 'animAnimNode_Base')` is true. */
export function isAnimType(typeName: string, baseName: string): boolean {
  let current: string | null = typeName
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    if (current === baseName) return true
    seen.add(current)
    current = getAnimTypeParent(current)
  }
  return false
}

/** Concrete classes that extend `baseName` (excludes the base itself). */
export function listAnimTypeImplementations(baseName: string): string[] {
  const names: string[] = []
  for (const [name, def] of Object.entries(types)) {
    if (name === baseName || def.kind !== 'class') continue
    if (isAnimType(name, baseName)) names.push(name)
  }
  names.sort()
  return names
}

export function getAnimEnumValues(typeName: string): readonly string[] | null {
  const def = resolveAnimType(typeName)
  return def?.kind === 'enum' ? def.values : null
}

/** Own + inherited fields (parent first). Cached per type name. */
export function getAnimTypeFields(typeName: string): readonly AnimFieldDef[] {
  const cached = fieldsCache.get(typeName)
  if (cached) return cached

  const chain: string[] = []
  let current: string | null = typeName
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    chain.push(current)
    current = getAnimTypeParent(current)
  }

  const fields: AnimFieldDef[] = []
  for (let i = chain.length - 1; i >= 0; i--) {
    const def = resolveAnimType(chain[i]!)
    if (def?.kind === 'class' || def?.kind === 'struct') {
      fields.push(...def.fields)
    }
  }

  fieldsCache.set(typeName, Object.freeze(fields))
  return fields
}

/** If `typeName` is a struct with `node: wref<T>`, return T (link pattern). */
export function structWrefNodeTarget(typeName: string): string | null {
  const def = resolveAnimType(typeName)
  if (def?.kind !== 'struct') return null
  for (const field of def.fields) {
    if (field.key === 'node' && isWrefFieldType(field.type)) return field.type.wref
  }
  return null
}
