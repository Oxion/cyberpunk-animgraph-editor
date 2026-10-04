/**
 * Floating animgraph handles — in shared handlesRegistry, NOT in nodesToInit.
 * Project save: flat handlesRegistry array + floatingHandleIds.
 */

import type { AnimgraphNode } from './animgraphTypes'
import type { RenderData } from './diagramTypes'

/** Ensure runtime floating set exists. */
export function ensureFloatingHandleIds(renderData: RenderData): Set<string> {
  if (!renderData.floatingHandleIds) {
    renderData.floatingHandleIds = new Set()
  }
  return renderData.floatingHandleIds
}

export function isFloatingHandle(
  renderData: RenderData,
  handleId: string
): boolean {
  return !!renderData.floatingHandleIds?.has(handleId)
}

/**
 * Register handle as floating: put/replace in shared registry, mark in bucket.
 * Does not touch nodesToInit.
 */
export function addFloatingHandle(
  renderData: RenderData,
  handle: AnimgraphNode
): void {
  const id = String(handle.HandleId)
  renderData.handlesRegistry.set(id, handle)
  ensureFloatingHandleIds(renderData).add(id)
}

/** Remove from floating bucket only (handle may remain in registry if promoted). */
export function clearFloatingMark(
  renderData: RenderData,
  handleId: string
): void {
  renderData.floatingHandleIds?.delete(handleId)
}

/**
 * Drop floating mark and optionally delete from registry.
 * Use when discarding an unsaved-to-animgraph node.
 */
export function removeFloatingHandle(
  renderData: RenderData,
  handleId: string,
  options?: { deleteFromRegistry?: boolean }
): void {
  clearFloatingMark(renderData, handleId)
  if (options?.deleteFromRegistry !== false) {
    renderData.handlesRegistry.delete(handleId)
  }
}

/** Promote: leave Data in registry, remove floating status (e.g. after connect to Description). */
export function promoteFloatingHandle(
  renderData: RenderData,
  handleId: string
): void {
  clearFloatingMark(renderData, handleId)
}

/** Flat registry snapshot for tool/project save (deep clone). */
export function collectHandlesRegistryForSave(
  renderData: RenderData
): AnimgraphNode[] {
  const out: AnimgraphNode[] = []
  for (const handle of renderData.handlesRegistry.values()) {
    out.push(JSON.parse(JSON.stringify(handle)) as AnimgraphNode)
  }
  return out
}

export function collectFloatingHandleIdsForSave(renderData: RenderData): string[] {
  return Array.from(renderData.floatingHandleIds ?? [])
}

/** Rebuild Map from saved flat registry array. */
export function registryFromSavedHandles(
  handles: readonly AnimgraphNode[] | undefined
): Map<string, AnimgraphNode> {
  const registry = new Map<string, AnimgraphNode>()
  if (!handles?.length) return registry
  for (const handle of handles) {
    if (!handle?.HandleId || !handle.Data) continue
    registry.set(String(handle.HandleId), handle)
  }
  return registry
}
