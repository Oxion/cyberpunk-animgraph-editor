/**
 * Bind-time compile pass (engine AnimGraph::CompileAndCacheDataLayout subset).
 * Flat handle iteration — no tree order required for ServiceEvent registration.
 */

import type { AnimgraphNode } from '../graph/animgraphTypes'
import type { InstanceStore } from '../InstanceStore'
import type { SimInputBoard } from './SimInputBoard'
import type { SimServiceEvent } from './simServiceEvents'

export type SimServiceEventKind = SimServiceEvent['kind']

/** Runtime ctx for DispatchEvent (before Update). */
export type SimServiceDispatchCtx = {
  handles: Map<string, AnimgraphNode>
  board: SimInputBoard
  instanceStore: InstanceStore
  /** Engine eyesLookAtDirectionTemp — optional sink. */
  eyesLookAtDirection: number
  eyesLookAtDirectionEnabled: boolean
}

/**
 * Batch handler: matching events this frame for this listener.
 * (Engine calls per-event; we batch so nodes can rebuild once.)
 */
export type SimServiceEventBatchHandler = (
  node: AnimgraphNode,
  events: readonly SimServiceEvent[],
  rt: SimServiceDispatchCtx
) => void

export type SimServiceEventListener = {
  handleId: string
  kinds: ReadonlySet<SimServiceEventKind>
  onEvents: SimServiceEventBatchHandler
}

/** Shared compile services (engine AnimInstanceBufferCompiler subset). */
export type SimCompileCtx = {
  instanceStore: InstanceStore
  /**
   * Engine AddEventListener — register for ServiceEvent kinds.
   * Bound to the current node being compiled.
   */
  addEventListener: (
    kinds: SimServiceEventKind | readonly SimServiceEventKind[],
    onEvents: SimServiceEventBatchHandler
  ) => void
}

export type SimCompiledGraph = {
  serviceListeners: SimServiceEventListener[]
}

export type SimCompileNodeFn = (
  node: AnimgraphNode,
  ctx: SimCompileCtx
) => void

/**
 * Bind-time compile: iterate all handles, let nodes register via compileNode.
 */
export function compileSimGraph(
  handles: Map<string, AnimgraphNode>,
  instanceStore: InstanceStore,
  compileNode: SimCompileNodeFn
): SimCompiledGraph {
  const serviceListeners: SimServiceEventListener[] = []

  for (const [handleId, node] of handles) {
    if (!node) continue
    const ctx: SimCompileCtx = {
      instanceStore,
      addEventListener(kinds, onEvents) {
        const list = (Array.isArray(kinds) ? kinds : [kinds]) as SimServiceEventKind[]
        serviceListeners.push({
          handleId,
          kinds: new Set(list),
          onEvents,
        })
      },
    }
    compileNode(node, ctx)
  }

  return { serviceListeners }
}

/**
 * Engine AnimInstanceBufferLayout::DispatchEvent — before Update walk.
 * Batches events per listener that matches any kind in the frame list.
 */
export function dispatchCompiledServiceEvents(
  compiled: SimCompiledGraph | null,
  events: readonly SimServiceEvent[],
  rt: SimServiceDispatchCtx
): void {
  if (!compiled || events.length === 0 || compiled.serviceListeners.length === 0) {
    return
  }
  for (const L of compiled.serviceListeners) {
    const matched = events.filter((e) => L.kinds.has(e.kind))
    if (matched.length === 0) continue
    const node = rt.handles.get(L.handleId)
    if (!node) continue
    L.onEvents(node, matched, rt)
  }
}
