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
  events: readonly SimServiceEvent[],
  rt: SimServiceDispatchCtx
) => void

export type SimServiceEventListener = {
  kinds: ReadonlySet<SimServiceEventKind>
  onEvents: SimServiceEventBatchHandler
}

/** Fired once per instance create (engine AnimGraph::Init / OnInit). */
export type SimInitHandler = (rt: SimServiceDispatchCtx) => void

export type SimInitListener = {
  handleId: string
  onInit: SimInitHandler
}

/** Fired when a compiled node leaves the active Update path (was active → not). */
export type SimDeactivateHandler = (rt: SimServiceDispatchCtx) => void

export type SimDeactivateListener = {
  handleId: string
  onDeactivate: SimDeactivateHandler
}

/** Shared compile services (engine AnimInstanceBufferCompiler subset). */
export type SimCompileCtx = {
  instanceStore: InstanceStore
  /** Shared input board — nodes may seed feature defaults at bind/compile. */
  board: SimInputBoard
  /**
   * Engine AddEventListener — register for ServiceEvent kinds.
   * Bound to the current node being compiled.
   */
  addEventListener: (
    kinds: SimServiceEventKind | readonly SimServiceEventKind[],
    onEvents: SimServiceEventBatchHandler
  ) => void
  /**
   * Register OnInit for the node currently being compiled.
   * Runner fires after bind compile and after reset (instance create).
   */
  addInitListener: (onInit: SimInitHandler) => void
  /**
   * Register OnDeactivated for the node currently being compiled.
   * Runner fires when that handle leaves the active Update path.
   */
  addDeactivateListener: (onDeactivate: SimDeactivateHandler) => void
}

export type SimCompiledGraph = {
  serviceListeners: SimServiceEventListener[]
  initListeners: SimInitListener[]
  deactivateListeners: SimDeactivateListener[]
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
  compileNode: SimCompileNodeFn,
  board: SimInputBoard
): SimCompiledGraph {
  const serviceListeners: SimServiceEventListener[] = []
  const initListeners: SimInitListener[] = []
  const deactivateListeners: SimDeactivateListener[] = []
  let currentHandleId = ''
  const ctx: SimCompileCtx = {
    instanceStore,
    board,
    addEventListener(kinds, onEvents) {
      const list = (Array.isArray(kinds) ? kinds : [kinds]) as SimServiceEventKind[]
      serviceListeners.push({
        kinds: new Set(list),
        onEvents,
      })
    },
    addInitListener(onInit) {
      if (!currentHandleId) return
      initListeners.push({ handleId: currentHandleId, onInit })
    },
    addDeactivateListener(onDeactivate) {
      if (!currentHandleId) return
      deactivateListeners.push({ handleId: currentHandleId, onDeactivate })
    },
  }

  for (const [, node] of handles) {
    if (!node) continue
    currentHandleId = node.HandleId
    compileNode(node, ctx)
  }

  return { serviceListeners, initListeners, deactivateListeners }
}

/** Fire compile-registered OnInit (bind / reset — engine AnimGraph::Init). */
export function dispatchCompiledInits(
  compiled: SimCompiledGraph | null,
  rt: SimServiceDispatchCtx
): void {
  if (!compiled || compiled.initListeners.length === 0) return
  for (const L of compiled.initListeners) {
    L.onInit(rt)
  }
}

/** Fire compile-registered OnDeactivated for handles that left the active path. */
export function dispatchCompiledDeactivates(
  compiled: SimCompiledGraph | null,
  prev: Record<string, { active?: unknown }> | undefined,
  now: Record<string, { active?: unknown }>,
  rt: SimServiceDispatchCtx
): void {
  if (!compiled || compiled.deactivateListeners.length === 0) return
  for (const L of compiled.deactivateListeners) {
    const was = !!prev?.[L.handleId]?.active
    const is = !!now[L.handleId]?.active
    if (!was || is) continue
    L.onDeactivate(rt)
  }
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
    L.onEvents(matched, rt)
  }
}
