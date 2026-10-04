import type { Component } from 'vue'
import { ChevronDown, ChevronUp, CircleDot, LayoutGrid, Link2 } from 'lucide-vue-next'
import {
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_MACHINE,
  ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM,
} from '../../utils/graph/animNodeTypes'
import { DIAGRAM_NODE_TYPE_PROPERTY_GROUP } from '../../utils/graph/diagramNodeTypes'

export type DiagramDetailsActionId =
  | 'stateAppliedLinks'
  | 'openSmRing'
  | 'smStateMoveUp'
  | 'smStateMoveDown'
  | 'smStatesGroupLayout'

export type DiagramDetailsActionDef = {
  id: DiagramDetailsActionId
  title: string
  icon: Component
  disabled?: boolean
}

const ACTION_DEFS: Record<DiagramDetailsActionId, DiagramDetailsActionDef> = {
  stateAppliedLinks: {
    id: 'stateAppliedLinks',
    title: 'Open state applied links',
    icon: Link2,
  },
  openSmRing: {
    id: 'openSmRing',
    title: 'Open ring window',
    icon: CircleDot,
  },
  smStateMoveUp: {
    id: 'smStateMoveUp',
    title: 'Move state up in SM.states',
    icon: ChevronUp,
  },
  smStateMoveDown: {
    id: 'smStateMoveDown',
    title: 'Move state down in SM.states',
    icon: ChevronDown,
  },
  smStatesGroupLayout: {
    id: 'smStatesGroupLayout',
    title: 'Layout states + fit group size',
    icon: LayoutGrid,
  },
}

/** Type → action ids. Gates (canOpen…) apply after this lookup. */
const actionsByDiagramType: Record<string, readonly DiagramDetailsActionId[]> = {
  [ANIM_NODE_TYPE_STATE]: ['smStateMoveUp', 'smStateMoveDown', 'stateAppliedLinks'],
  [ANIM_NODE_TYPE_STATE_MACHINE]: ['openSmRing'],
  [ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM]: ['openSmRing'],
  [DIAGRAM_NODE_TYPE_PROPERTY_GROUP]: ['smStatesGroupLayout'],
}

export function resolveDiagramDetailsActionIds(
  diagramNodeType: string | undefined | null
): readonly DiagramDetailsActionId[] {
  if (!diagramNodeType) return []
  return actionsByDiagramType[diagramNodeType] ?? []
}

export function getDiagramDetailsActionDef(
  id: DiagramDetailsActionId
): DiagramDetailsActionDef {
  return ACTION_DEFS[id]
}
