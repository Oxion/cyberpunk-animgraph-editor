/**
 * Blender-like node chrome: category header colors.
 * Pin socket/wire colors: `pinTyping/PIN_ENDPOINT_COLOR` (type → hex).
 */

import {
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
  ANIM_NODE_TYPE_STATE_MACHINE,
  ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM,
} from './animNodeTypes'
import {
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
} from './diagramNodeTypes'

export type NodeChromeCategory =
  | 'pose'
  | 'float'
  | 'bool'
  | 'int'
  | 'vector'
  | 'constraint'
  | 'control'
  | 'signal'
  | 'sm'
  | 'state'
  | 'transition'
  | 'portal'
  | 'group'
  | 'note'
  | 'default'

export type NodeChromeHints = {
  isPortal?: boolean
  isStateMachine?: boolean
  isState?: boolean
  isTransition?: boolean
  isConditionalEntry?: boolean
  isGroup?: boolean
}

/** Shared Blender-like body: lighter than canvas; border slightly lighter than body. */
export const NODE_CHROME_BODY = '#3a3a3a'
export const NODE_CHROME_STROKE = '#5c5c5c'
export const NODE_CHROME_TITLE = '#e8e8e8'
export const NODE_CHROME_SUBTITLE = '#b0b0b0'

const HEADER_BY_CATEGORY: Record<NodeChromeCategory, string> = {
  pose: '#2e6231',
  float: '#4a5560',
  bool: '#6b3a5a',
  int: '#3a5a7a',
  vector: '#4a3a6b',
  constraint: '#6b5a30',
  control: '#2e5a55',
  signal: '#6b5a20',
  sm: '#2e4a62',
  state: '#2e4a62',
  transition: '#2e6231',
  portal: '#2e4a62',
  group: '#3d3d3d',
  note: '#6b5a20',
  default: '#3d3d3d',
}

export function resolveNodeChromeCategory(
  type: string,
  hints?: NodeChromeHints
): NodeChromeCategory {
  if (hints?.isPortal) return 'portal'
  if (hints?.isStateMachine) return 'sm'
  if (hints?.isState) return 'state'
  if (hints?.isTransition || hints?.isConditionalEntry) return 'transition'
  if (hints?.isGroup) return 'group'

  const t = type || ''

  if (
    t === ANIM_NODE_TYPE_STATE_MACHINE ||
    t === ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM ||
    t.includes('StateMachine')
  ) {
    return 'sm'
  }
  if (t === ANIM_NODE_TYPE_STATE || t === ANIM_NODE_TYPE_STATE_FROZEN) return 'state'
  if (t.includes('Transition') || t.includes('ConditionalEntry')) return 'transition'
  if (t === DIAGRAM_NODE_TYPE_PROPERTY_GROUP || t === DIAGRAM_NODE_TYPE_GROUP) return 'group'
  if (t === DIAGRAM_NODE_TYPE_NOTE) return 'note'
  if (t === 'diagram-portal') return 'portal'

  if (
    /Constraint/i.test(t) ||
    /SetBone/i.test(t) ||
    /RotateBone/i.test(t) ||
    /TranslateBone/i.test(t)
  ) {
    return 'constraint'
  }

  if (/SourceChannel_/i.test(t) || /Quaternion/i.test(t) || /Vector/i.test(t) || /Transform/i.test(t)) {
    return 'vector'
  }

  if (/Bool/i.test(t) || /AnimSetTagValue/i.test(t)) return 'bool'

  if (/IntInput|IntToFloat|IntConstant|IntJoin|IntClamp/i.test(t) || /animAnimNode_Int/.test(t)) {
    return 'int'
  }

  if (
    /Float/i.test(t) ||
    /MathExpressionFloat/i.test(t) ||
    /Clamp/i.test(t) ||
    /Damp/i.test(t) ||
    /Latch/i.test(t) ||
    /Random/i.test(t) ||
    /Sinus/i.test(t) ||
    /CurveFloat/i.test(t)
  ) {
    return 'float'
  }

  if (/Signal/i.test(t)) return 'signal'

  if (
    /Blend/i.test(t) ||
    /Switch/i.test(t) ||
    /Join/i.test(t) ||
    /SkAnim/i.test(t) ||
    /SkFrame|SkSpeed/i.test(t) ||
    /Output/i.test(t) ||
    /Identity/i.test(t) ||
    /Wrapper/i.test(t) ||
    /MathExpressionPose/i.test(t)
  ) {
    return 'pose'
  }

  // StaticSwitch / Switch already covered; remaining control-ish
  if (/StaticSwitch/i.test(t)) return 'control'

  return 'default'
}

export function headerFillForCategory(category: NodeChromeCategory): string {
  return HEADER_BY_CATEGORY[category]
}

export function blenderVisualForCategory(category: NodeChromeCategory): {
  fill: string
  headerFill: string
  stroke: string
  titleFill: string
  subtitleFill: string
} {
  return {
    fill: NODE_CHROME_BODY,
    headerFill: headerFillForCategory(category),
    stroke: NODE_CHROME_STROKE,
    titleFill: NODE_CHROME_TITLE,
    subtitleFill: NODE_CHROME_SUBTITLE,
  }
}
