import type {
  ResizeAncestorPlan,
  ResizeNeighbourContact,
  ResizeStartLayout,
} from '../../stores/tools/resize'
import { isDiagramOverviewLeaf } from './DiagramConversion'
import type { RenderData, RenderNode } from './diagramTypes'
import { getDirectChildren } from './nodeChildSlots'

/** Optional history hook — callers (move/resize) pass trackLayoutBeforeChange. */
export type BeforeLayoutMutate = (node: RenderNode) => void

export type ResizeLayoutDelta = {
  dx: number
  dy: number
  dw: number
  dh: number
}

export const MIN_NODE_WIDTH = 50
export const MIN_NODE_HEIGHT = 30

export const captureResizeStartLayout = (node: RenderNode): ResizeStartLayout => ({
  x: node.position.x,
  y: node.position.y,
  width: node.size.width,
  height: node.size.height,
})

export const applyResizeStartLayout = (node: RenderNode, layout: ResizeStartLayout) => {
  node.position.x = layout.x
  node.position.y = layout.y
  node.bounds.x = layout.x
  node.bounds.y = layout.y
  node.size.width = layout.width
  node.size.height = layout.height
  node.bounds.width = layout.width
  node.bounds.height = layout.height
}

/** Ancestors of seeds + their direct children (for origin-shift compensate) + parent neighbours. */
export const collectResizeCascadeNodeIds = (
  diagramData: RenderData,
  seedIds: Iterable<string>
): Set<string> => {
  const ids = new Set<string>()

  for (const seedId of seedIds) {
    let node = diagramData.allNodes.get(seedId)
    while (node?.parent) {
      const parent = node.parent
      ids.add(parent.id)
      // Children use local coords; when parent origin shifts they must be restored + compensated.
      for (const child of getDirectChildren(parent)) {
        ids.add(child.id)
      }
      const grandParentKids = parent.parent ? getDirectChildren(parent.parent) : []
      if (grandParentKids.length) {
        for (const neighbour of grandParentKids) {
          if (neighbour.id !== parent.id) ids.add(neighbour.id)
        }
      }
      node = parent
    }
  }

  return ids
}

export const captureResizeCascadeBaselines = (
  diagramData: RenderData,
  seedIds: Iterable<string>
): Map<string, ResizeStartLayout> => {
  const baselines = new Map<string, ResizeStartLayout>()

  for (const id of collectResizeCascadeNodeIds(diagramData, seedIds)) {
    const node = diagramData.allNodes.get(id)
    if (!node) continue
    baselines.set(id, captureResizeStartLayout(node))
  }
  return baselines
}

export const isResizeLayoutDeltaZero = (delta: ResizeLayoutDelta) =>
  delta.dx === 0 && delta.dy === 0 && delta.dw === 0 && delta.dh === 0

const EDGE_CONTACT_TOL = 0.5

/**
 * Build leaf→root ancestor plans with neighbours sorted closest→farthest per side
 * for chain contact push (N1 pushes N2 after they touch).
 */
export const buildResizeCascadePlan = (
  diagramData: RenderData,
  seedIds: Iterable<string>
): ResizeAncestorPlan[] => {
  const byParentId = new Map<string, ResizeAncestorPlan>()

  for (const seedId of seedIds) {
    let node = diagramData.allNodes.get(seedId)
    let depth = 0
    while (node?.parent) {
      depth += 1
      const parent = node.parent
      const parentStart = captureResizeStartLayout(parent)
      const parentRight = parentStart.x + parentStart.width
      const parentBottom = parentStart.y + parentStart.height

      let plan = byParentId.get(parent.id)
      if (!plan) {
        const right: ResizeNeighbourContact[] = []
        const left: ResizeNeighbourContact[] = []
        const below: ResizeNeighbourContact[] = []
        const above: ResizeNeighbourContact[] = []

        if (parent.parent) {
          for (const neighbour of getDirectChildren(parent.parent)) {
            if (neighbour.id === parent.id) continue
            const n = captureResizeStartLayout(neighbour)
            const nRight = n.x + n.width
            const nBottom = n.y + n.height

            if (n.x >= parentRight - EDGE_CONTACT_TOL) {
              right.push({ id: neighbour.id })
            }
            if (nRight <= parentStart.x + EDGE_CONTACT_TOL) {
              left.push({ id: neighbour.id })
            }
            if (n.y >= parentBottom - EDGE_CONTACT_TOL) {
              below.push({ id: neighbour.id })
            }
            if (nBottom <= parentStart.y + EDGE_CONTACT_TOL) {
              above.push({ id: neighbour.id })
            }
          }
        }

        // Closest to parent first — required for chain transmission.
        right.sort((a, b) => {
          const la = captureResizeStartLayout(diagramData.allNodes.get(a.id)!).x
          const lb = captureResizeStartLayout(diagramData.allNodes.get(b.id)!).x
          return la - lb
        })
        left.sort((a, b) => {
          const la = captureResizeStartLayout(diagramData.allNodes.get(a.id)!)
          const lb = captureResizeStartLayout(diagramData.allNodes.get(b.id)!)
          return lb.x + lb.width - (la.x + la.width)
        })
        below.sort((a, b) => {
          const la = captureResizeStartLayout(diagramData.allNodes.get(a.id)!).y
          const lb = captureResizeStartLayout(diagramData.allNodes.get(b.id)!).y
          return la - lb
        })
        above.sort((a, b) => {
          const la = captureResizeStartLayout(diagramData.allNodes.get(a.id)!)
          const lb = captureResizeStartLayout(diagramData.allNodes.get(b.id)!)
          return lb.y + lb.height - (la.y + la.height)
        })

        plan = {
          parentId: parent.id,
          linkChildIds: [],
          childIds: getDirectChildren(parent).map((child) => child.id),
          right,
          left,
          below,
          above,
          depth,
        }
        byParentId.set(parent.id, plan)
      }

      if (!plan.linkChildIds.includes(node.id)) {
        plan.linkChildIds.push(node.id)
      }
      if (depth > plan.depth) plan.depth = depth

      node = parent
    }
  }

  // depth 1 = direct parent (closest to leaf); higher = further uptree.
  return [...byParentId.values()].sort((a, b) => a.depth - b.depth)
}

/** Union AABB of layouts in the same local space (parent-local for link children). */
export const unionLayoutsBBox = (
  layouts: ResizeStartLayout[]
): ResizeStartLayout | null => {
  if (layouts.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const layout of layouts) {
    minX = Math.min(minX, layout.x)
    minY = Math.min(minY, layout.y)
    maxX = Math.max(maxX, layout.x + layout.width)
    maxY = Math.max(maxY, layout.y + layout.height)
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

/**
 * Grow parent only enough to contain the union bbox of link children
 * (overflow in parent-local space). Children use coords relative to the
 * parent's top-left (0,0), not parent.position.
 */
export const computeParentFitDelta = (
  parentStart: ResizeStartLayout,
  childLayouts: ResizeStartLayout[]
): ResizeLayoutDelta => {
  const union = unionLayoutsBBox(childLayouts)
  if (!union) {
    return { dx: 0, dy: 0, dw: 0, dh: 0 }
  }

  const overflowL = Math.max(0, -union.x)
  const overflowR = Math.max(0, union.x + union.width - parentStart.width)
  const overflowT = Math.max(0, -union.y)
  const overflowB = Math.max(0, union.y + union.height - parentStart.height)

  return {
    dx: -overflowL,
    dy: -overflowT,
    dw: overflowL + overflowR,
    dh: overflowT + overflowB,
  }
}

/**
 * Parent position is local to its parent; children are local to parent.
 * Shifting parent origin (left/top grow) would drag children in world space —
 * counteract by the inverse local offset so their world position stays put.
 */
export const compensateChildrenForParentOriginShift = (
  parent: RenderNode,
  dx: number,
  dy: number,
  onBeforeLayoutMutate?: BeforeLayoutMutate
): string[] => {
  const kids = getDirectChildren(parent)
  if ((dx === 0 && dy === 0) || !kids.length) return []

  const affectedIds: string[] = []
  for (const child of kids) {
    onBeforeLayoutMutate?.(child)
    child.position.x -= dx
    child.position.y -= dy
    child.bounds.x = child.position.x
    child.bounds.y = child.position.y
    affectedIds.push(child.id)
  }
  return affectedIds
}

/**
 * Chain-push neighbours on one side: each transmits leftover advance after its gap.
 * Closest neighbour moves first; further ones only after contact through the chain.
 */
export const applyNeighbourChainOnSide = (
  diagramData: RenderData,
  contacts: ResizeNeighbourContact[],
  parentStart: ResizeStartLayout,
  edgeGrowth: number,
  side: 'right' | 'left' | 'below' | 'above',
  baselineLayouts: Map<string, ResizeStartLayout>,
  moves: Map<string, { mx: number; my: number }>
) => {
  if (edgeGrowth <= 0 || contacts.length === 0) return

  const addMove = (id: string, mx: number, my: number) => {
    if (mx === 0 && my === 0) return
    const prev = moves.get(id) ?? { mx: 0, my: 0 }
    moves.set(id, { mx: prev.mx + mx, my: prev.my + my })
  }

  let advance = edgeGrowth
  let prevEnd =
    side === 'right'
      ? parentStart.x + parentStart.width
      : side === 'left'
        ? parentStart.x
        : side === 'below'
          ? parentStart.y + parentStart.height
          : parentStart.y

  for (const { id } of contacts) {
    const start =
      baselineLayouts.get(id) ??
      (() => {
        const node = diagramData.allNodes.get(id)
        return node ? captureResizeStartLayout(node) : null
      })()
    if (!start) continue

    let gap = 0
    if (side === 'right') {
      gap = start.x - prevEnd
    } else if (side === 'left') {
      gap = prevEnd - (start.x + start.width)
    } else if (side === 'below') {
      gap = start.y - prevEnd
    } else {
      gap = prevEnd - (start.y + start.height)
    }

    const push = Math.max(0, advance - Math.max(0, gap))
    if (side === 'right') addMove(id, push, 0)
    else if (side === 'left') addMove(id, -push, 0)
    else if (side === 'below') addMove(id, 0, push)
    else addMove(id, 0, -push)

    advance = push
    prevEnd =
      side === 'right'
        ? start.x + start.width
        : side === 'left'
          ? start.x
          : side === 'below'
            ? start.y + start.height
            : start.y
  }
}

/** Push side neighbours with chain transmission after contact. */
export const applyNeighbourContactPush = (
  diagramData: RenderData,
  plan: ResizeAncestorPlan,
  delta: ResizeLayoutDelta,
  baselineLayouts: Map<string, ResizeStartLayout>,
  onBeforeLayoutMutate?: BeforeLayoutMutate
): string[] => {
  if (isResizeLayoutDeltaZero(delta)) return []

  const parentStart = baselineLayouts.get(plan.parentId)
  if (!parentStart) return []

  const rightEdge = delta.dx + delta.dw
  const bottomEdge = delta.dy + delta.dh
  const moves = new Map<string, { mx: number; my: number }>()

  if (rightEdge > 0) {
    applyNeighbourChainOnSide(
      diagramData,
      plan.right,
      parentStart,
      rightEdge,
      'right',
      baselineLayouts,
      moves
    )
  }
  if (delta.dx < 0) {
    applyNeighbourChainOnSide(
      diagramData,
      plan.left,
      parentStart,
      -delta.dx,
      'left',
      baselineLayouts,
      moves
    )
  }
  if (bottomEdge > 0) {
    applyNeighbourChainOnSide(
      diagramData,
      plan.below,
      parentStart,
      bottomEdge,
      'below',
      baselineLayouts,
      moves
    )
  }
  if (delta.dy < 0) {
    applyNeighbourChainOnSide(
      diagramData,
      plan.above,
      parentStart,
      -delta.dy,
      'above',
      baselineLayouts,
      moves
    )
  }

  const affectedIds: string[] = []
  for (const [id, { mx, my }] of moves) {
    if (mx === 0 && my === 0) continue
    const neighbour = diagramData.allNodes.get(id)
    if (!neighbour) continue
    const start = baselineLayouts.get(id) ?? captureResizeStartLayout(neighbour)
    onBeforeLayoutMutate?.(neighbour)
    applyResizeStartLayout(neighbour, {
      x: start.x + mx,
      y: start.y + my,
      width: start.width,
      height: start.height,
    })
    affectedIds.push(id)
  }
  return affectedIds
}

export type ApplyResizeCascadeOptions = {
  growParents: boolean
  moveParentNeighbours: boolean
  minNodeWidth?: number
  minNodeHeight?: number
  onBeforeLayoutMutate?: BeforeLayoutMutate
}

/**
 * Apply parent growth + contact neighbour push (until-needed at every level).
 * Each ancestor grows only when its link child overflows local 0..size.
 * Process leaf→root so a grown parent can overflow the next ancestor in the same frame.
 * Neighbours push only after edge growth exceeds precomputed slack.
 */
export const applyResizeCascadePlan = (
  diagramData: RenderData,
  plans: ResizeAncestorPlan[],
  baselineLayouts: Map<string, ResizeStartLayout>,
  options: ApplyResizeCascadeOptions
): { affectedIds: string[] } => {
  const affectedIds: string[] = []
  if (!options.growParents && !options.moveParentNeighbours) {
    return { affectedIds }
  }

  const minW = options.minNodeWidth ?? MIN_NODE_WIDTH
  const minH = options.minNodeHeight ?? MIN_NODE_HEIGHT

  for (const plan of plans) {
    const parent = diagramData.allNodes.get(plan.parentId)
    if (!parent) continue

    // Overview / SM leaves keep a fixed footprint; children live only for scope subviews.
    // Editing inside a subview must not resize or neighbour-push these containers.
    if (isDiagramOverviewLeaf(parent)) {
      continue
    }

    const parentStart = baselineLayouts.get(plan.parentId) ?? captureResizeStartLayout(parent)
    const linkLayouts = plan.linkChildIds
      .map((id) => {
        const link = diagramData.allNodes.get(id)
        return link ? captureResizeStartLayout(link) : null
      })
      .filter((layout): layout is ResizeStartLayout => Boolean(layout))

    const delta = options.growParents
      ? computeParentFitDelta(parentStart, linkLayouts)
      : { dx: 0, dy: 0, dw: 0, dh: 0 }

    if (isResizeLayoutDeltaZero(delta)) continue

    if (options.growParents) {
      options.onBeforeLayoutMutate?.(parent)
      applyResizeStartLayout(parent, {
        x: parentStart.x + delta.dx,
        y: parentStart.y + delta.dy,
        width: Math.max(minW, parentStart.width + delta.dw),
        height: Math.max(minH, parentStart.height + delta.dh),
      })
      affectedIds.push(parent.id)
      if (delta.dx !== 0 || delta.dy !== 0) {
        const compensated = compensateChildrenForParentOriginShift(
          parent,
          delta.dx,
          delta.dy,
          options.onBeforeLayoutMutate
        )
        affectedIds.push(...compensated)
      }
    }

    if (options.moveParentNeighbours) {
      const moved = applyNeighbourContactPush(
        diagramData,
        plan,
        delta,
        baselineLayouts,
        options.onBeforeLayoutMutate
      )
      affectedIds.push(...moved)
    }
  }

  return { affectedIds }
}

/**
 * Recursively grow parents only when children overflow (union bbox of seeds).
 * Neighbour push is opt-in via options.moveParentNeighbours (off for move/resize tools).
 */
export const applyResizeParentCascade = (
  diagramData: RenderData,
  node: RenderNode,
  _delta: ResizeLayoutDelta,
  baselineLayouts: Map<string, ResizeStartLayout>,
  options: ApplyResizeCascadeOptions
): string[] => {
  const plans = buildResizeCascadePlan(diagramData, [node.id])
  return applyResizeCascadePlan(diagramData, plans, baselineLayouts, options).affectedIds
}

export const restoreResizeCascadeBaselines = (
  diagramData: RenderData,
  baselines: Map<string, ResizeStartLayout>
) => {
  for (const [id, layout] of baselines) {
    const node = diagramData.allNodes.get(id)
    if (!node) continue
    applyResizeStartLayout(node, layout)
  }
}
