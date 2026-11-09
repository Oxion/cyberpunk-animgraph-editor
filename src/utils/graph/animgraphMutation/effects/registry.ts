/**
 * Field-change effect handlers keyed by string id.
 * NodeDefinition lists ids only (pure data); handlers live here.
 */

import type { AnimgraphNode } from '../../animgraphTypes'
import type { AnimgraphMutationCtx } from '../ctx'
import type { OwnerFieldChange } from '../fieldChangeTypes'

export type FieldChangeEffectHandler = (
  ctx: AnimgraphMutationCtx,
  owner: AnimgraphNode,
  changes: readonly OwnerFieldChange[]
) => void

const handlers = new Map<string, FieldChangeEffectHandler>()

export function registerFieldChangeEffect(
  id: string,
  handler: FieldChangeEffectHandler
): void {
  handlers.set(id, handler)
}

export function getFieldChangeEffect(
  id: string
): FieldChangeEffectHandler | undefined {
  return handlers.get(id)
}

export function runFieldChangeEffects(
  ids: readonly string[] | undefined,
  ctx: AnimgraphMutationCtx,
  owner: AnimgraphNode,
  changes: readonly OwnerFieldChange[]
): void {
  if (!ids?.length) return
  for (const id of ids) {
    handlers.get(id)?.(ctx, owner, changes)
  }
}