/**
 * Animgraph slot addable types — contain (`slot.ref`) plus optional pin-DAG extras.
 *
 * Pin extras only when `strict` is false. Wrap cuts pin walk (those types belong
 * on the wrapper, not this PG). Contain fields of C are not recursed.
 */

import {
  isAnimType,
  listAnimTypeImplementations,
} from '../animTypes'
import { NodeDefinitionRegistry, type ChildSlotDef } from '../NodeDefinition'
import { getProjectedWrap, isProjectedEmbedded } from '../projection'
import { isRootNodeType } from './animNodeTypeUtils'
import {
  fieldContainerKind,
  listPinFields,
  pinSlotExpectedType,
  type AnimgraphPinWalkMode,
} from './pinTyping'

export type { AnimgraphPinWalkMode }

export type AnimgraphSlotAddableOrigin = 'contain' | 'pin'

export type AnimgraphSlotAddableRow = {
  diagramNodeType: string
  animgraphNodeType: string
  origin: AnimgraphSlotAddableOrigin
  /** Pin / pin-override field that would host this type in the PG. */
  pin?: {
    ownerType: string
    fieldName: string
    kind: 'array' | 'scalar'
    expectedType: string
  }
}

export type ListAnimgraphPinClosureOptions = {
  /** Include `rootType` itself as a row. Default true. */
  includeRoot?: boolean
  /** Default `'pin'`. */
  pinMode?: AnimgraphPinWalkMode
  /**
   * When true, `diagramNodeType === animgraphNodeType` (wrapper body boxes).
   * When false, apply `getProjectedWrap`. Default false.
   */
  diagramAsAnimgraph?: boolean
}

export function passesGlobalAddEligibility(nodeType: string): boolean {
  if (isRootNodeType(nodeType)) return false
  if (isProjectedEmbedded(nodeType)) return false
  return true
}

function typesMatchingBase(base: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (t: string) => {
    if (seen.has(t) || !passesGlobalAddEligibility(t)) return
    seen.add(t)
    out.push(t)
  }
  add(base)
  for (const t of listAnimTypeImplementations(base)) add(t)
  for (const t of NodeDefinitionRegistry.getAllNodeTypes()) {
    if (isAnimType(t, base)) add(t)
  }
  return out
}

function containAnimgraphTypes(slot: ChildSlotDef): string[] {
  return NodeDefinitionRegistry.getAllNodeTypes().filter(
    (t) =>
      passesGlobalAddEligibility(t) &&
      NodeDefinitionRegistry.passesSlotAllowedTypes(slot, t)
  )
}

function toRow(
  animgraphNodeType: string,
  origin: AnimgraphSlotAddableOrigin,
  pin?: AnimgraphSlotAddableRow['pin'],
  diagramAsAnimgraph = false
): AnimgraphSlotAddableRow {
  return {
    diagramNodeType: diagramAsAnimgraph
      ? animgraphNodeType
      : (getProjectedWrap(animgraphNodeType) ?? animgraphNodeType),
    animgraphNodeType,
    origin,
    ...(pin ? { pin } : {}),
  }
}

/**
 * Recursive pin-DAG types reachable from `rootType` (projection pins).
 * Does not recurse into types that have `wrap` (those belong under their own wrapper).
 * Contain fields are not walked.
 */
export function listAnimgraphPinClosureTypes(
  rootType: string,
  options?: ListAnimgraphPinClosureOptions
): AnimgraphSlotAddableRow[] {
  const includeRoot = options?.includeRoot !== false
  const pinMode = options?.pinMode ?? 'pin'
  const diagramAsAnimgraph = options?.diagramAsAnimgraph === true

  const rows: AnimgraphSlotAddableRow[] = []
  const hosted = new Set<string>()

  if (includeRoot && passesGlobalAddEligibility(rootType)) {
    hosted.add(rootType)
    rows.push(toRow(rootType, 'contain', undefined, diagramAsAnimgraph))
  }

  const work = [rootType]
  while (work.length > 0) {
    const consumer = work.pop()!

    for (const field of listPinFields(consumer, pinMode)) {
      const expected = pinSlotExpectedType(field.type)
      if (!expected) continue

      const pin = {
        ownerType: consumer,
        fieldName: field.key,
        kind: fieldContainerKind(field.type),
        expectedType: expected,
      }
      for (const child of typesMatchingBase(expected)) {
        if (hosted.has(child)) continue
        hosted.add(child)
        rows.push(toRow(child, 'pin', pin, diagramAsAnimgraph))
        // Wrapped types are catalogued but not expanded (body lives on their wrapper).
        if (!getProjectedWrap(child)) work.push(child)
      }
    }
  }

  return rows
}

/**
 * Types the Add UI may offer for this animgraph contain slot.
 * Schema only — occupancy is applied by dispatch.
 */
export function listAnimgraphSlotAddableTypes(
  slot: ChildSlotDef,
  strict: boolean
): AnimgraphSlotAddableRow[] {
  const contain = containAnimgraphTypes(slot)
  const rows: AnimgraphSlotAddableRow[] = contain.map((t) => toRow(t, 'contain'))
  if (strict) return rows

  const hosted = new Set(contain)
  const work = [...contain]
  while (work.length > 0) {
    const consumer = work.pop()!
    // Wrap cuts PG pin walk — those types belong on the wrapper, not this PG.
    if (getProjectedWrap(consumer)) continue

    for (const field of listPinFields(consumer, 'pin-override')) {
      const expected = pinSlotExpectedType(field.type)
      if (!expected) continue

      const pin = {
        ownerType: consumer,
        fieldName: field.key,
        kind: fieldContainerKind(field.type),
        expectedType: expected,
      }
      for (const child of typesMatchingBase(expected)) {
        if (hosted.has(child)) continue
        hosted.add(child)
        work.push(child)
        rows.push(toRow(child, 'pin', pin))
      }
    }
  }
  return rows
}

/**
 * All eligible animgraph types for a floating handle (no parent slot attach).
 */
export function listFloatingAnimgraphAddableRows(): AnimgraphSlotAddableRow[] {
  const seen = new Set<string>()
  const rows: AnimgraphSlotAddableRow[] = []
  for (const t of NodeDefinitionRegistry.getAllNodeTypes()) {
    if (!passesGlobalAddEligibility(t)) continue
    const row = toRow(t, 'contain')
    const key = `${row.diagramNodeType}#${row.animgraphNodeType}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(row)
  }
  return rows
}

export function pinFieldAsChildSlot(
  pin: NonNullable<AnimgraphSlotAddableRow['pin']>
): ChildSlotDef {
  return {
    name: pin.fieldName,
    kind: pin.kind,
    allowedTypes: [pin.expectedType],
  }
}
