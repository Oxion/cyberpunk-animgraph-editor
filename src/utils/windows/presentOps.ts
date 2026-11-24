import type { AppWindowType } from '../../types/AppWindow'
import type { GraphViewEntry } from '../../types/GraphView'
import type { CameraPresentOp, WindowPresentOps } from '../../types/WindowPresent'
import { isStateMachineDiagramRoot } from '../graph/DiagramConversion'
import type { RenderData } from '../graph/diagramTypes'
import { DEFAULT_CHILD_SLOT } from '../graph/nodeChildSlots'
import { getSmPropertyGroup } from '../graph/StateMachineDetailLayout'
import type { PresentWorldRectOptions } from '../PixiGraphRenderer'

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

/** Body stack / window graph-scope camera policy. Undefined → renderer default (fit-scope). */
export function getGraphViewPresentOps(
  entry: GraphViewEntry,
  diagramData?: RenderData | null
): CameraPresentOp | undefined {
  if (entry.kind !== 'graph-scope' || !entry.payload.scopeRootId) {
    return undefined
  }

  const scopeRootNode = diagramData?.allNodes.get(entry.payload.scopeRootId)
  if (!scopeRootNode) return undefined

  if (isStateMachineDiagramRoot(scopeRootNode)) {
    if (entry.payload.hideScopeRoot && diagramData) {
      const statesGroupNodeId = getSmPropertyGroup(scopeRootNode, 'states', diagramData.allNodes)?.id
      if (!statesGroupNodeId) return undefined
      
      return {
        id: 'focus-node',
        nodeId: statesGroupNodeId,
        align: 'top-end',
        fit: 'none',
        minZoom: 0.05,
        maxZoom: 1,
        padding: 16,
      }
    }
  }

  if (entry.payload.hideScopeRoot) {
    const firstChildNodeId = scopeRootNode.childSlots?.[DEFAULT_CHILD_SLOT]?.[0]?.id
    if (firstChildNodeId) {
      return {
        id: 'focus-node',
        nodeId: firstChildNodeId,
        align: 'center',
        fit: 'contain',
        minZoom: 0.05,
        maxZoom: 1,
        padding: 16,
      }
    }
  }

  return {
    id: 'focus-node',
    nodeId: scopeRootNode.id,
    align: 'center',
    fit: 'contain',
    minZoom: 0.05,
    maxZoom: 1,
    padding: 16,
  }
}

export function cameraOpToRectOptions(
  op: CameraPresentOp,
  extra: Pick<PresentWorldRectOptions, 'rightInset'> = {}
): PresentWorldRectOptions | undefined {
  if (op.id === 'fit-scope') return undefined
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

export function resolveOpPresentNodeId(
  op: CameraPresentOp,
  ctx: { graphData?: RenderData | null; scopeRootId?: string }
): string | undefined {
  switch (op.id) {
    case 'fit-scope':
      return undefined
    case 'focus-section':
      return undefined
    case 'focus-node':
      return op.nodeId
    default:
      return undefined
  }
}