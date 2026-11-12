import { getPredicate } from './predicates'
import type { PredicateContext } from './types'

export function whenTrue(
  id: string,
  ctx: PredicateContext,
): boolean {
  const pred = getPredicate(id)
  if (!pred) {
    console.warn(`[when] Unknown predicate "${id}"`)
    return true
  }
  return pred(ctx)
}
