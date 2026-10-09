import type { GraphViewEntry } from '../../types/GraphView'
import type { CameraPresentOp, WindowPresentOps } from '../../types/WindowPresent'
import type { AppWindowType } from '../../types/AppWindow'
import type { RenderData } from '../graph/diagramTypes'
import { getSmPropertyGroup } from '../graph/StateMachineDetailLayout'
import { isStateMachineDiagramRoot } from '../graph/DiagramConversion'
import type { PixiGraphRenderer, PresentWorldRectOptions } from '../PixiGraphRenderer'

const OPS: Record<AppWindowType, WindowPresentOps> = {
  lens: {
    placement: 'left-stretch',
    preferredWidth: 520,
    preferredHeight: 400,
    afterReady: { id: 'fit-scope' },
  },
  'sm-ring': {
    placement: 'left-stretch',
    preferredWidth: 560,
    preferredHeight: 480,
  },
  'state-links': {
    placement: 'left-stretch',
    preferredWidth: 520,
    widthFraction: 0.4,
    preferredHeight: 480,
    afterReady: {
      id: 'focus-section',
      sectionId: 'outgoingTransitions',
      align: 'top-end',
      fit: 'none',
      zoom: 1,
      minZoom: 1,
      maxZoom: 1,
      padding: 16,
    },
  },
  settings: {
    placement: 'dialog',
    preferredWidth: 720,
    preferredHeight: 520,
  },
  'render-stats': {
    placement: 'left-content',
    preferredWidth: 360,
    preferredHeight: 440,
    afterReady: { id: 'size-to-content' },
  },
  'sim-skeleton': {
    placement: 'dialog',
    preferredWidth: 640,
    preferredHeight: 520,
  },
  'sim-status': {
    placement: 'dialog',
    preferredWidth: 360,
    preferredHeight: 320,
  },
}

export function getWindowPresentOps(type: AppWindowType): WindowPresentOps {
  return OPS[type]
}

const SM_CHILDREN_PRESENT: CameraPresentOp = {
  id: 'focus-resolve',
  resolve: 'sm-states-group',
  align: 'top-end',
  fit: 'none',
  zoom: 1,
  minZoom: 1,
  maxZoom: 1,
  padding: 16,
}

/** Body stack / window graph-scope camera policy. Undefined → renderer default (fit-scope). */
export function getGraphViewPresentOps(
  entry: GraphViewEntry,
  graphData?: RenderData | null
): CameraPresentOp | undefined {
  if (entry.kind !== 'graph-scope' || !entry.payload.hideScopeRoot || !entry.payload.scopeRootId) {
    return undefined
  }
  const root = graphData?.allNodes.get(entry.payload.scopeRootId)
  if (!root || !isStateMachineDiagramRoot(root)) return undefined
  return SM_CHILDREN_PRESENT
}

export function cameraOpToRectOptions(
  op: Exclude<CameraPresentOp, { id: 'fit-scope' }>,
  extra: Pick<PresentWorldRectOptions, 'rightInset'> = {}
): PresentWorldRectOptions {
  return {
    align: op.align,
    fit: op.fit,
    zoom: op.zoom,
    padding: op.padding ?? 16,
    minZoom: op.minZoom ?? 1,
    maxZoom: op.maxZoom ?? 1,
    rightInset: extra.rightInset,
  }
}

export function resolvePresentNodeId(
  op: CameraPresentOp,
  ctx: { graphData?: RenderData | null; scopeRootId?: string }
): string | undefined {
  if (op.id !== 'focus-resolve' || op.resolve !== 'sm-states-group') return undefined
  const rootId = ctx.scopeRootId
  if (!rootId || !ctx.graphData) return undefined
  const sm = ctx.graphData.allNodes.get(rootId)
  if (!sm) return undefined
  return getSmPropertyGroup(sm, 'states', ctx.graphData.allNodes)?.id
}

export function applyCameraPresentOp(
  renderer: PixiGraphRenderer,
  op: CameraPresentOp,
  ctx: {
    bounds?: { x: number; y: number; width: number; height: number } | null
    graphData?: RenderData | null
    scopeRootId?: string
    rightInset?: number
  } = {}
): void {
  if (op.id === 'fit-scope') {
    if (ctx.bounds && ctx.bounds.width > 0 && ctx.bounds.height > 0) {
      renderer.presentWorldRect(ctx.bounds, {
        align: 'center',
        fit: 'contain',
        padding: 20,
        minZoom: 0.05,
        maxZoom: 3,
      })
    } else {
      renderer.fitViewToScope()
    }
    return
  }
  const options = cameraOpToRectOptions(op, { rightInset: ctx.rightInset })
  if (op.id === 'focus-section') {
    if (ctx.bounds && ctx.bounds.width > 0 && ctx.bounds.height > 0) {
      renderer.presentWorldRect(ctx.bounds, {
        align: 'center',
        fit: 'contain',
        padding: 20,
        minZoom: 0.05,
        maxZoom: 3,
      })
    } else {
      renderer.fitViewToScope()
    }
    return
  }
  const nodeId = resolvePresentNodeId(op, ctx)
  const rect = nodeId ? renderer.resolveDiagramNodeWithIdWorldRect(nodeId) : null
  if (!rect) {
    renderer.fitViewToScope()
    return
  }
  renderer.presentWorldRect(rect, options)
}
