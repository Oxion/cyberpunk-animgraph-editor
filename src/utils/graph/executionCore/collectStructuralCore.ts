import type { AnimgraphNode } from '../animgraphTypes'
import type { RenderData } from '../diagramTypes'
import { NodeDefinitionRegistry } from '../../NodeDefinition'
import { resolveHandle } from '../../sim/simDataUtils'
import {
  getExecutionPreferredSinkType,
  getExecutionRole,
  isExecutionEntry,
  isExecutionSink,
} from './resolve'

function handleType(node: AnimgraphNode): string {
  return String(node.Data?.$type ?? '')
}

/** Follow diagram pin inputs (schema + extraPins), same contract as sim. */
function forEachLinkedInput(
  node: AnimgraphNode,
  handles: Map<string, AnimgraphNode>,
  visit: (linked: AnimgraphNode | null) => void
): void {
  const t = handleType(node)
  if (!t) return
  for (const pinName of NodeDefinitionRegistry.getInputFields(t)) {
    const handler = NodeDefinitionRegistry.getNodeInputHandler(t, pinName)
    const count = handler.count(node)
    for (let i = 0; i < count; i++) {
      visit(resolveHandle(handles, handler.get(node, i)))
    }
  }
}

function collectSinksUnderHost(
  host: AnimgraphNode,
  handles: Map<string, AnimgraphNode>,
  out: AnimgraphNode[],
  seen: Set<string>
): void {
  const role = getExecutionRole(handleType(host))
  if (!role?.sinkHostFields?.length) return

  for (const field of role.sinkHostFields) {
    const val = host.Data?.[field]
    const refs = Array.isArray(val) ? val : val != null ? [val] : []
    for (const ref of refs) {
      const child = resolveHandle(handles, ref)
      if (!child) continue
      const childType = handleType(child)
      if (isExecutionSink(childType)) {
        if (!seen.has(child.HandleId)) {
          seen.add(child.HandleId)
          out.push(child)
        }
        continue
      }
      if (getExecutionRole(childType)?.sinkHostFields?.length) {
        collectSinksUnderHost(child, handles, out, seen)
      }
    }
  }
}

function collectAllSinks(handles: Map<string, AnimgraphNode>): AnimgraphNode[] {
  const sinks: AnimgraphNode[] = []
  const seen = new Set<string>()

  for (const handle of handles.values()) {
    if (!isExecutionSink(handleType(handle))) continue
    if (seen.has(handle.HandleId)) continue
    seen.add(handle.HandleId)
    sinks.push(handle)
  }

  for (const handle of handles.values()) {
    if (!getExecutionRole(handleType(handle))?.sinkHostFields?.length) continue
    collectSinksUnderHost(handle, handles, sinks, seen)
  }

  return sinks
}

function findRootHandle(
  handles: Map<string, AnimgraphNode>,
  originalAnimgraph: RenderData['originalAnimgraph']
): AnimgraphNode | null {
  const fromChunk = resolveHandle(handles, originalAnimgraph?.rootNode)
  if (fromChunk) return fromChunk
  for (const handle of handles.values()) {
    if (isExecutionEntry(handleType(handle))) return handle
  }
  return null
}

function seedReverseFromHandle(
  handle: AnimgraphNode | null,
  handles: Map<string, AnimgraphNode>,
  enqueue: (id: string) => void
): void {
  if (!handle) return
  const t = handleType(handle)
  if (isExecutionSink(t)) {
    enqueue(handle.HandleId)
    return
  }
  if (getExecutionRole(t)?.sinkHostFields?.length) {
    const sinks: AnimgraphNode[] = []
    collectSinksUnderHost(handle, handles, sinks, new Set())
    for (const sink of sinks) enqueue(sink.HandleId)
    return
  }
  enqueue(handle.HandleId)
}

/**
 * Structural execution core: all handles on reverse pin paths from every Output
 * sink (all states) plus the Root entry pose graph. No sim weights / active state.
 */
export function collectStructuralCoreHandleIds(renderData: RenderData): Set<string> {
  const handles = renderData.handlesRegistry
  const core = new Set<string>()
  const queue: string[] = []

  const enqueue = (id: string) => {
    if (!handles.has(id) || core.has(id)) return
    core.add(id)
    queue.push(id)
  }

  const root = findRootHandle(handles, renderData.originalAnimgraph)
  if (root) {
    for (const field of getExecutionRole(handleType(root))?.entryPoseFields ?? []) {
      seedReverseFromHandle(resolveHandle(handles, root.Data?.[field]), handles, enqueue)
    }
    const nodes = Array.isArray(root.Data?.nodes) ? root.Data.nodes : []
    if (nodes.length > 0) {
      seedReverseFromHandle(resolveHandle(handles, nodes[0]), handles, enqueue)
    }
  }

  for (const sink of collectAllSinks(handles)) {
    enqueue(sink.HandleId)
  }

  while (queue.length > 0) {
    const id = queue.shift()!
    const handle = handles.get(id)
    if (!handle) continue
    forEachLinkedInput(handle, handles, (linked) => {
      if (linked) enqueue(linked.HandleId)
    })
  }

  return core
}

export function isHandleInStructuralCore(
  renderData: RenderData,
  handleId: string
): boolean {
  return collectStructuralCoreHandleIds(renderData).has(handleId)
}

/** Reverse producer chain from a handle (pin inputs), including the start handle. */
export function collectReverseProducerHandleIds(
  renderData: RenderData,
  startHandleId: string
): Set<string> {
  const handles = renderData.handlesRegistry
  const producers = new Set<string>()
  const queue: string[] = []

  const enqueue = (id: string) => {
    if (!handles.has(id) || producers.has(id)) return
    producers.add(id)
    queue.push(id)
  }

  enqueue(startHandleId)

  while (queue.length > 0) {
    const id = queue.shift()!
    const handle = handles.get(id)
    if (!handle) continue
    forEachLinkedInput(handle, handles, (linked) => {
      if (linked) enqueue(linked.HandleId)
    })
  }

  return producers
}

/** Resolve the preferred Output under a State / SM host (mirrors sim findStateOutput). */
export function findPreferredSinkUnderHost(
  host: AnimgraphNode,
  handles: Map<string, AnimgraphNode>
): AnimgraphNode | null {
  const preferred = getExecutionPreferredSinkType(handleType(host))
  const sinks: AnimgraphNode[] = []
  collectSinksUnderHost(host, handles, sinks, new Set())
  return (
    sinks.find((s) => handleType(s) === preferred) ??
    sinks[0] ??
    null
  )
}
