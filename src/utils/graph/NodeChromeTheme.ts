/**
 * Blender-like node chrome: per-type header colors (codegen).
 * Pin socket/wire colors: `pinTyping/PIN_ENDPOINT_COLOR` (type → hex).
 */

import {
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_FROZEN,
  ANIM_NODE_TYPE_STATE_MACHINE,
  ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM,
} from './animNodeTypes'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
  DIAGRAM_NODE_TYPE_PORTAL,
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from './diagramNodeTypes'
import { NODE_HEADER_COLOR_FALLBACK } from './nodeHeaderColors/nodeHeaderColorSeeds'
import { NODE_HEADER_FILL } from './nodeHeaderColors/nodeHeaderColors.generated'

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

/**
 * Structural hints remap to canonical diagram / animgraph types before lookup.
 */
export function resolveChromeLookupType(
  type: string,
  hints?: NodeChromeHints
): string {
  if (hints?.isPortal) return DIAGRAM_NODE_TYPE_PORTAL
  if (hints?.isGroup) return DIAGRAM_NODE_TYPE_GROUP
  if (hints?.isStateMachine) {
    if (
      type === ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM ||
      type.includes('StateMachineDiagram')
    ) {
      return ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM
    }
    return ANIM_NODE_TYPE_STATE_MACHINE
  }
  if (hints?.isState) {
    if (type === ANIM_NODE_TYPE_STATE_FROZEN) return ANIM_NODE_TYPE_STATE_FROZEN
    return ANIM_NODE_TYPE_STATE
  }
  if (hints?.isConditionalEntry) return DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE
  if (hints?.isTransition) {
    if (type === DIAGRAM_TRANSITION_WRAPPER_TYPE) return DIAGRAM_TRANSITION_WRAPPER_TYPE
    if (type === DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE) {
      return DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE
    }
    return DIAGRAM_TRANSITION_WRAPPER_TYPE
  }

  // Normalize known diagram natives if passed under aliases
  if (type === DIAGRAM_NODE_TYPE_PROPERTY_GROUP || type === DIAGRAM_NODE_TYPE_GROUP) {
    return type
  }
  if (type === DIAGRAM_NODE_TYPE_NOTE) return DIAGRAM_NODE_TYPE_NOTE
  if (type === DIAGRAM_NODE_TYPE_PORTAL) return DIAGRAM_NODE_TYPE_PORTAL

  return type || ''
}

export function headerFillForNodeType(
  type: string,
  hints?: NodeChromeHints
): string {
  const key = resolveChromeLookupType(type, hints)
  return NODE_HEADER_FILL[key] ?? NODE_HEADER_COLOR_FALLBACK
}

export function blenderVisualForNodeType(
  type: string,
  hints?: NodeChromeHints
): {
  fill: string
  headerFill: string
  stroke: string
  titleFill: string
  subtitleFill: string
} {
  return {
    fill: NODE_CHROME_BODY,
    headerFill: headerFillForNodeType(type, hints),
    stroke: NODE_CHROME_STROKE,
    titleFill: NODE_CHROME_TITLE,
    subtitleFill: NODE_CHROME_SUBTITLE,
  }
}
