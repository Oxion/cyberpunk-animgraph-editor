import type { WhenPredicate, WhenPredicateMap } from './types'

const predicates: WhenPredicateMap = {
  always: () => true,
  never: () => false,
}

export function registerPredicate(id: string, predicate: WhenPredicate) {
  if (predicates[id]) {
    throw new Error(`Predicate "${id}" already registered`)
  }
  predicates[id] = predicate
}

export function unregisterPredicate(id: string) {
  delete predicates[id]
}

export function getPredicate(id: string): WhenPredicate | undefined {
  return predicates[id]
}
