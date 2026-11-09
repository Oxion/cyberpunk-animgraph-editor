/**
 * Post-mutation field effects from node definitions:
 * - derivedFrom (e.g. numInputs ← inputNodes.length)
 * - contain ensureOrder
 * - fieldChangeEffects ids → handler registry
 */

import type { AnimFieldDerived } from '../../animTypes'
import { resolveAnimFields } from '../../animFieldSchema'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import type { AnimgraphNode } from '../animgraphTypes'
import type { AnimgraphMutationCtx } from './ctx'
import type { OwnerFieldChange } from './fieldChangeTypes'
import { runFieldChangeEffects } from './effects/registry'

export type { OwnerFieldChange } from './fieldChangeTypes'

export type FieldChangeEffectCtx = {
  handlesRegistry: Map<string, AnimgraphNode>
  node: AnimgraphNode
}

function ownerTypeOf(owner: AnimgraphNode): string {
  return String(owner.Data?.$type ?? '')
}

function collectDerivedMappings(
  typeName: string
): Array<{ targetKey: string; derivedFrom: AnimFieldDerived }> {
  const out: Array<{ targetKey: string; derivedFrom: AnimFieldDerived }> = []
  const seen = new Set<string>()

  const constraints =
    NodeDefinitionRegistry.getNodeDefinition(typeName)?.fieldConstraints ?? {}
  for (const [targetKey, constraint] of Object.entries(constraints)) {
    if (!constraint.derivedFrom) continue
    seen.add(targetKey)
    out.push({ targetKey, derivedFrom: constraint.derivedFrom })
  }

  for (const field of resolveAnimFields(typeName)) {
    if (!field.derivedFrom || seen.has(field.key)) continue
    out.push({ targetKey: field.key, derivedFrom: field.derivedFrom })
  }

  return out
}

function writeDerivedValue(
  data: Record<string, unknown>,
  targetKey: string,
  derivedFrom: AnimFieldDerived
): void {
  if (derivedFrom.kind === 'arrayLength') {
    const raw = data[derivedFrom.key]
    data[targetKey] = Array.isArray(raw) ? raw.length : 0
  }
}

/**
 * Sync Data fields whose `derivedFrom` source is among `changedSourceKeys`.
 * Safe without mutation ctx (NodePins append, etc.).
 */
export function syncDerivedFields(
  node: AnimgraphNode,
  changedSourceKeys: readonly string[]
): void {
  if (!node.Data || changedSourceKeys.length === 0) return
  const typeName = ownerTypeOf(node)
  if (!typeName) return
  const sources = new Set(changedSourceKeys)
  const data = node.Data as Record<string, unknown>

  for (const { targetKey, derivedFrom } of collectDerivedMappings(typeName)) {
    if (!sources.has(derivedFrom.key)) continue
    writeDerivedValue(data, targetKey, derivedFrom)
  }
}

function ensureOrder(
  ctx: AnimgraphMutationCtx,
  owner: AnimgraphNode,
  field: string
): void {
  const parentType = ownerTypeOf(owner)
  if (!parentType) return
  NodeDefinitionRegistry.getHandleTypeChildrenHandler(
    parentType,
    field
  )?.ensureOrder(ctx.handlesRegistry, owner, field)
}

function normalizeChanges(
  changes: readonly OwnerFieldChange[] | readonly string[]
): OwnerFieldChange[] {
  if (changes.length === 0) return []
  if (typeof changes[0] === 'string') {
    return (changes as readonly string[]).map((field) => ({ field }))
  }
  return [...(changes as readonly OwnerFieldChange[])]
}

/**
 * After owner.Data fields change: derivedFrom, ensureOrder, registered effect ids.
 */
export function applyOwnerFieldEffects(
  ctx: AnimgraphMutationCtx,
  ownerId: string,
  changesInput: readonly OwnerFieldChange[] | readonly string[]
): void {
  const changes = normalizeChanges(changesInput)
  if (changes.length === 0) return
  const owner = ctx.handlesRegistry.get(ownerId)
  if (!owner?.Data) return

  const fieldNames = changes.map((c) => c.field)
  syncDerivedFields(owner, fieldNames)

  for (const field of fieldNames) {
    ensureOrder(ctx, owner, field)
  }

  const typeName = ownerTypeOf(owner)
  const effectIds =
    NodeDefinitionRegistry.getNodeDefinition(typeName)?.fieldChangeEffects
  runFieldChangeEffects(effectIds, ctx, owner, changes)
}
