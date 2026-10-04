/**
 * Named child slots on RenderNode.
 * Default slot `children` is what used to be the flat `children[]` array.
 * Slot `overview` holds in-card chrome on overview leaves (not walked by lens).
 */

import type { RenderNode } from './diagramTypes'

export const DEFAULT_CHILD_SLOT = 'children'
export const OVERVIEW_CHILD_SLOT = 'overview'

export type ChildSlotWalkOptions = {
  /** Slots to visit; default = all keys on childSlots. */
  slots?: readonly string[]
  /** Slots to skip (e.g. exclude overview from lens walks). */
  excludeSlots?: readonly string[]
}

export function emptyChildSlots(
  initial?: Partial<Record<string, RenderNode[]>>
): Record<string, RenderNode[]> {
  return {
    [DEFAULT_CHILD_SLOT]: [],
    ...initial,
  }
}

export function getChildSlot(
  node: RenderNode,
  slot: string = DEFAULT_CHILD_SLOT
): RenderNode[] {
  if (!node.childSlots) {
    node.childSlots = emptyChildSlots()
  }
  const list = node.childSlots[slot]
  if (!list) {
    node.childSlots[slot] = []
    return node.childSlots[slot]!
  }
  return list
}

export function ensureChildSlot(
  node: RenderNode,
  slot: string = DEFAULT_CHILD_SLOT
): RenderNode[] {
  return getChildSlot(node, slot)
}

export function getAllChildSlotNames(node: RenderNode): string[] {
  if (!node.childSlots) return [DEFAULT_CHILD_SLOT]
  return Object.keys(node.childSlots)
}

function slotNamesForWalk(
  node: RenderNode,
  opts?: ChildSlotWalkOptions
): string[] {
  const names = opts?.slots
    ? [...opts.slots]
    : getAllChildSlotNames(node)
  if (!opts?.excludeSlots?.length) return names
  const exclude = new Set(opts.excludeSlots)
  return names.filter((n) => !exclude.has(n))
}

/** Direct children across selected slots (default: all slots). */
export function getDirectChildren(
  node: RenderNode,
  opts?: ChildSlotWalkOptions
): RenderNode[] {
  const out: RenderNode[] = []
  for (const slot of slotNamesForWalk(node, opts)) {
    const list = node.childSlots?.[slot]
    if (list?.length) out.push(...list)
  }
  return out
}

export function forEachDirectChild(
  node: RenderNode,
  fn: (child: RenderNode, slot: string) => void,
  opts?: ChildSlotWalkOptions
): void {
  for (const slot of slotNamesForWalk(node, opts)) {
    const list = node.childSlots?.[slot]
    if (!list) continue
    for (const child of list) fn(child, slot)
  }
}

export function walkSubtree(
  node: RenderNode,
  fn: (node: RenderNode) => void,
  opts?: ChildSlotWalkOptions
): void {
  fn(node)
  forEachDirectChild(
    node,
    (child) => walkSubtree(child, fn, opts),
    opts
  )
}

/** Lens / body walks: default slot only (exclude overview chrome). */
export function walkBodySubtree(
  node: RenderNode,
  fn: (node: RenderNode) => void
): void {
  walkSubtree(node, fn, { slots: [DEFAULT_CHILD_SLOT] })
}

export function appendChild(
  parent: RenderNode,
  child: RenderNode,
  slot: string = DEFAULT_CHILD_SLOT
): void {
  if (child.parent) {
    removeChild(child.parent, child)
  }
  const list = ensureChildSlot(parent, slot)
  list.push(child)
  child.parent = parent
  child.parentSlot = slot
}

export function removeChild(parent: RenderNode, child: RenderNode): boolean {
  if (!parent.childSlots) return false
  const slot = child.parentSlot ?? DEFAULT_CHILD_SLOT
  const list = parent.childSlots[slot]
  if (!list) {
    // Fallback: search all slots
    for (const [name, nodes] of Object.entries(parent.childSlots)) {
      const idx = nodes.indexOf(child)
      if (idx >= 0) {
        nodes.splice(idx, 1)
        if (child.parent === parent) {
          child.parent = undefined
          child.parentSlot = undefined
        }
        return true
      }
      void name
    }
    return false
  }
  const idx = list.indexOf(child)
  if (idx < 0) return false
  list.splice(idx, 1)
  if (child.parent === parent) {
    child.parent = undefined
    child.parentSlot = undefined
  }
  return true
}

export function reparent(
  child: RenderNode,
  newParent: RenderNode,
  slot: string = DEFAULT_CHILD_SLOT
): void {
  appendChild(newParent, child, slot)
}

export function findInChildSlot(
  parent: RenderNode,
  predicate: (child: RenderNode) => boolean,
  slot: string = DEFAULT_CHILD_SLOT
): RenderNode | undefined {
  return getChildSlot(parent, slot).find(predicate)
}

export function filterChildSlot(
  parent: RenderNode,
  predicate: (child: RenderNode) => boolean,
  slot: string = DEFAULT_CHILD_SLOT
): RenderNode[] {
  return getChildSlot(parent, slot).filter(predicate)
}
