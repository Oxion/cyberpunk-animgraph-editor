import type { AnimgraphData, AnimgraphNode } from '../animgraphTypes'

/** Animgraph contain owner (HandleRef membership) — no diagram ids. */
export type ContainOwnerRef = {
  ownerId: string
  slot: string
}

/** Animgraph-only mutation context — no diagram / RenderData. */
export type AnimgraphMutationCtx = {
  handlesRegistry: Map<string, AnimgraphNode>
  animgraph: AnimgraphData
  /** Reverse index for membership; diagram binds PG climb. */
  resolveContainOwner?: (memberId: string) => ContainOwnerRef | null
}
