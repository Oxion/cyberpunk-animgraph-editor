import { defaultWhenPredicates } from './predicates'
import type { AppContext, WhenPredicateMap } from './types'

export function whenTrue(
  id: string | undefined,
  ctx: AppContext,
  predicates: WhenPredicateMap = defaultWhenPredicates
): boolean {
  if (!id) return true
  const pred = predicates[id]
  if (!pred) {
    console.warn(`[when] Unknown predicate "${id}"`)
    return true
  }
  return pred(ctx)
}
