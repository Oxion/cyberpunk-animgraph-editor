import type { Component } from 'vue'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from '../../utils/graph/DiagramConversion'
import {
  DIAGRAM_NODE_TYPE_PORTAL,
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
} from '../../utils/graph/diagramNodeTypes'
import {
  CONDITIONAL_ENTRY_TYPE,
  TRANSITION_DESCRIPTION_TYPE,
} from '../../utils/graph/StateMachineDetailLayout'
import ConditionalEntryDetailsSection from './ConditionalEntryDetailsSection.vue'
import DefaultStackedDetailsSection from './DefaultStackedDetailsSection.vue'
import PortalDetailsSection from './PortalDetailsSection.vue'
import GroupDetailsSection from './GroupDetailsSection.vue'
import NoteDetailsSection from './NoteDetailsSection.vue'
import PropertyGroupDetailsSection from './PropertyGroupDetailsSection.vue'
import StateDetailsSection from './StateDetailsSection.vue'
import StateMachineDetailsSection from './StateMachineDetailsSection.vue'
import TransitionDetailsSection from './TransitionDetailsSection.vue'
import TypedDataDetailsSection from './TypedDataDetailsSection.vue'
import { TYPED_DATA_BODY_DIAGRAM_NODE_TYPES_SET } from '@/utils/graph/typedDataBodyDiagramNodeTypes.ts'

export type DiagramDetailsPanelEntry = {
  /** Accordion section title */
  title: string
  component: Component
}

function shortTypedTitle(type: string): string {
  return type
    .replace(/^animAnimStateTransitionCondition_/, '')
    .replace(/^animAnimStateTransitionInterpolator_/, '')
    .replace(/^animAnimNodeSourceChannel_/, '')
    .replace(/^animAnimNode_/, '')
    .replace(/^anim/, '')
}

const fixedPanels: Record<string, DiagramDetailsPanelEntry> = {
  animAnimNode_StateMachine: {
    title: 'State Machine',
    component: StateMachineDetailsSection,
  },
  animAnimNode_StateMachineDiagram: {
    title: 'State Machine',
    component: StateMachineDetailsSection,
  },
  animAnimNode_State: {
    title: 'State',
    component: StateDetailsSection,
  },
  [TRANSITION_DESCRIPTION_TYPE]: {
    title: 'Transition',
    component: TransitionDetailsSection,
  },
  [DIAGRAM_TRANSITION_WRAPPER_TYPE]: {
    title: 'Transition',
    component: TransitionDetailsSection,
  },
  [CONDITIONAL_ENTRY_TYPE]: {
    title: 'Conditional Entry',
    component: ConditionalEntryDetailsSection,
  },
  [DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE]: {
    title: 'Conditional Entry',
    component: ConditionalEntryDetailsSection,
  },
  PropertyGroup: {
    title: 'Property Group',
    component: PropertyGroupDetailsSection,
  },
  [DIAGRAM_NODE_TYPE_GROUP]: {
    title: 'Group',
    component: GroupDetailsSection,
  },
  [DIAGRAM_NODE_TYPE_NOTE]: {
    title: 'Note',
    component: NoteDetailsSection,
  },
  [DIAGRAM_NODE_TYPE_PORTAL]: {
    title: 'Portal',
    component: PortalDetailsSection,
  },
}

const typedPanels: Record<string, DiagramDetailsPanelEntry> = {}
for (const diagramNodeType of TYPED_DATA_BODY_DIAGRAM_NODE_TYPES_SET) {
  typedPanels[diagramNodeType] = {
    title: shortTypedTitle(diagramNodeType),
    component: TypedDataDetailsSection,
  }
}

/**
 * Type-specific Node Details panels, keyed by diagram node type (`RenderNode.type`).
 */
export const detailsPanelsByDiagramType: Record<string, DiagramDetailsPanelEntry> = {
  ...typedPanels,
  ...fixedPanels,
}

export function resolveDiagramDetailsPanel(
  diagramNodeType: string | undefined | null
): DiagramDetailsPanelEntry | null {
  if (!diagramNodeType) return null
  const hit = detailsPanelsByDiagramType[diagramNodeType]
  if (hit) return hit
  // Phase C: default stacked for remaining diagram types
  return {
    title: shortTypedTitle(diagramNodeType) || 'Properties',
    component: DefaultStackedDetailsSection,
  }
}
