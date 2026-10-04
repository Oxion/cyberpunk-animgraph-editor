/**
 * Diagram node definitions — rules for diagram-native types (PropertyGroup, Group,
 * wrappers, Note, overview leaves, …). Independent of animgraph NodeDefinitionRegistry
 * for structure; wrapper body catalogs may scan animgraph types by prefix.
 *
 * Children live in named `RenderNode.childSlots`; defs declare per-slot allowlists.
 */

import { NodeDefinitionRegistry } from '../NodeDefinition'
import {
  DEFAULT_CHILD_SLOT,
  OVERVIEW_CHILD_SLOT,
} from './nodeChildSlots'
import {
  ANIM_NODE_TRANSITION_CONDITION_PREFIX,
  ANIM_NODE_TRANSITION_INTERPOLATOR_PREFIX,
  ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  ANIM_NODE_TYPE_STATE,
  ANIM_NODE_TYPE_STATE_MACHINE,
  ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM,
  ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
} from './animNodeTypes'
import {
  DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE,
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
  DIAGRAM_TRANSITION_WRAPPER_TYPE,
} from './diagramNodeTypes'

export {
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
} from './diagramNodeTypes'

/** How a diagram child slot stores kids. */
export type DiagramContainerKind = 'array' | 'scalar'

export type DiagramChildSlotDef = {
  name: string
  kind?: DiagramContainerKind
  allowedTypes?: readonly string[]
  /**
   * At most one direct child of each listed type may exist in this diagram slot
   * (e.g. only one TransitionDescription under a transition wrapper).
   */
  uniqueTypes?: readonly string[]
}

export type DiagramNodeDefinition = {
  /**
   * Named diagram child slots (`children` body / lens, `overview` in-card, …).
   * Omit / empty = no diagram-declared child slots.
   */
  diagramChildSlots?: readonly DiagramChildSlotDef[]
  /**
   * When this diagram type is chosen in Add UI, the animgraph handle `$type`
   * to attach (e.g. transition wrapper → Description).
   */
  wrapperForAnimgraphType?: string
  /**
   * Parent view hides body children until a scope view opens.
   * Scope host for incoming portals / cross-overview wiring.
   */
  overviewLeaf?: boolean
}

const OVERVIEW_LEAF_SLOTS: readonly DiagramChildSlotDef[] = [
  { name: DEFAULT_CHILD_SLOT, kind: 'array' },
  {
    name: OVERVIEW_CHILD_SLOT,
    kind: 'array',
    allowedTypes: [DIAGRAM_NODE_TYPE_GROUP, DIAGRAM_NODE_TYPE_NOTE],
  },
]

/** Animgraph types whose name starts with any of the prefixes (stable sort). */
function listAnimgraphTypesByPrefix(prefixes: readonly string[]): string[] {
  const out: string[] = []
  for (const t of NodeDefinitionRegistry.getAllNodeTypes()) {
    if (prefixes.some((p) => t.startsWith(p))) out.push(t)
  }
  out.sort()
  return out
}

/** Body types allowed under a transition wrapper (Description + conditions + interpolators). */
function transitionWrapperBodyAllowedTypes(): string[] {
  return [
    ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
    ...listAnimgraphTypesByPrefix([
      ANIM_NODE_TRANSITION_CONDITION_PREFIX,
      ANIM_NODE_TRANSITION_INTERPOLATOR_PREFIX,
    ]),
  ]
}

/** Body types under a conditional-entry wrapper (Entry + conditions). */
function conditionalEntryWrapperBodyAllowedTypes(): string[] {
  return [
    ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
    ...listAnimgraphTypesByPrefix([ANIM_NODE_TRANSITION_CONDITION_PREFIX]),
  ]
}

const DIAGRAM_NODE_DEFINITIONS: Record<string, DiagramNodeDefinition> = {
  [DIAGRAM_NODE_TYPE_PROPERTY_GROUP]: {
    diagramChildSlots: [
      {
        name: DEFAULT_CHILD_SLOT,
        kind: 'array',
        allowedTypes: [DIAGRAM_NODE_TYPE_GROUP],
      },
    ],
  },
  [DIAGRAM_NODE_TYPE_GROUP]: {
    diagramChildSlots: [{ name: DEFAULT_CHILD_SLOT, kind: 'array' }],
  },
  [DIAGRAM_NODE_TYPE_NOTE]: {
    diagramChildSlots: [{ name: DEFAULT_CHILD_SLOT, kind: 'array' }],
  },
  [DIAGRAM_TRANSITION_WRAPPER_TYPE]: {
    overviewLeaf: true,
    diagramChildSlots: [
      {
        name: DEFAULT_CHILD_SLOT,
        kind: 'array',
        allowedTypes: transitionWrapperBodyAllowedTypes(),
        uniqueTypes: [ANIM_NODE_TYPE_TRANSITION_DESCRIPTION],
      },
      {
        name: OVERVIEW_CHILD_SLOT,
        kind: 'array',
        allowedTypes: [DIAGRAM_NODE_TYPE_GROUP, DIAGRAM_NODE_TYPE_NOTE],
      },
    ],
    wrapperForAnimgraphType: ANIM_NODE_TYPE_TRANSITION_DESCRIPTION,
  },
  [DIAGRAM_CONDITIONAL_ENTRY_WRAPPER_TYPE]: {
    overviewLeaf: true,
    diagramChildSlots: [
      {
        name: DEFAULT_CHILD_SLOT,
        kind: 'array',
        allowedTypes: conditionalEntryWrapperBodyAllowedTypes(),
        uniqueTypes: [ANIM_NODE_TYPE_CONDITIONAL_ENTRY],
      },
      {
        name: OVERVIEW_CHILD_SLOT,
        kind: 'array',
        allowedTypes: [DIAGRAM_NODE_TYPE_GROUP, DIAGRAM_NODE_TYPE_NOTE],
      },
    ],
    wrapperForAnimgraphType: ANIM_NODE_TYPE_CONDITIONAL_ENTRY,
  },
  [ANIM_NODE_TYPE_STATE]: {
    overviewLeaf: true,
    diagramChildSlots: OVERVIEW_LEAF_SLOTS,
  },
  [ANIM_NODE_TYPE_STATE_MACHINE]: {
    overviewLeaf: true,
    diagramChildSlots: OVERVIEW_LEAF_SLOTS,
  },
  [ANIM_NODE_TYPE_STATE_MACHINE_DIAGRAM]: {
    overviewLeaf: true,
    diagramChildSlots: OVERVIEW_LEAF_SLOTS,
  },
}

export const DiagramNodeDefinitionRegistry = {
  get(type: string): DiagramNodeDefinition | undefined {
    return DIAGRAM_NODE_DEFINITIONS[type]
  },

  has(type: string): boolean {
    return type in DIAGRAM_NODE_DEFINITIONS
  },

  getAllTypes(): string[] {
    return Object.keys(DIAGRAM_NODE_DEFINITIONS)
  },

  getDiagramChildSlots(parentType: string): readonly DiagramChildSlotDef[] {
    return DIAGRAM_NODE_DEFINITIONS[parentType]?.diagramChildSlots ?? []
  },

  getDiagramSlotDef(
    parentType: string,
    slotName: string
  ): DiagramChildSlotDef | undefined {
    return this.getDiagramChildSlots(parentType).find((s) => s.name === slotName)
  },

  getAllowedTypesForDiagramSlot(
    parentType: string,
    slotName: string
  ): readonly string[] {
    return this.getDiagramSlotDef(parentType, slotName)?.allowedTypes ?? []
  },

  /**
   * Slot exists and has no `allowedTypes` — diagram parenting is unrestricted.
   * Missing slot ≠ unrestricted (no diagram children declared).
   */
  isDiagramSlotUnrestricted(parentType: string, slotName: string): boolean {
    const def = this.getDiagramSlotDef(parentType, slotName)
    return def != null && def.allowedTypes === undefined
  },

  /** Unrestricted `children` slot — Group / Note / any future diagram frame. */
  isUnrestrictedContainer(type: string): boolean {
    return this.isDiagramSlotUnrestricted(type, DEFAULT_CHILD_SLOT)
  },

  getUniqueTypesForDiagramSlot(
    parentType: string,
    slotName: string
  ): readonly string[] {
    return this.getDiagramSlotDef(parentType, slotName)?.uniqueTypes ?? []
  },

  getContainerKind(
    type: string,
    slotName: string = DEFAULT_CHILD_SLOT
  ): DiagramContainerKind {
    return this.getDiagramSlotDef(type, slotName)?.kind ?? 'array'
  },

  /** Animgraph $type when adding this diagram UI type as a handle wrapper. */
  getWrapperAnimgraphType(diagramNodeType: string): string | undefined {
    return DIAGRAM_NODE_DEFINITIONS[diagramNodeType]?.wrapperForAnimgraphType
  },

  isWrapperType(diagramNodeType: string): boolean {
    return !!DIAGRAM_NODE_DEFINITIONS[diagramNodeType]?.wrapperForAnimgraphType
  },

  /** Parent view hides body children; portal / scope host. */
  isOverviewLeaf(type: string): boolean {
    return !!DIAGRAM_NODE_DEFINITIONS[type]?.overviewLeaf
  },
}
