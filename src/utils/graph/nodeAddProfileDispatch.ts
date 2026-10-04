/**
 * Add profile dispatch — place (diagramTarget + parentSlot) → AddProfile | deny.
 *
 * Resolve model:
 *   1. Early deny (portal) / overview-chrome (diagram overview slot only)
 *   2. Walk diagramTarget → closest animgraph-related (PG | wrapper | handle)
 *   3. Animgraph branch: matchers on that anchor → addable groups
 *   4. Diagram branch: DiagramNodeDefinition for target + parentSlot
 *   5. Compose; diagramTarget is the place target (unrestricted frames parent any type)
 */

import type { AnimgraphNode, AnimgraphNodeLike } from './animgraphTypes'
import type { RenderNode } from './diagramTypes'
import { NodeDefinitionRegistry, type ChildSlotDef } from '../NodeDefinition'
import {
  getPropertyGroupSlotName,
  isPropertyGroupNode,
  type DiagramAddDenialReason,
  type DiagramAddPlaceContext,
} from './diagramAddPolicy'
import { isDiagramPortalNode } from './DiagramConversion'
import {
  DIAGRAM_NODE_TYPE_GROUP,
  DIAGRAM_NODE_TYPE_NOTE,
  DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
  DiagramNodeDefinitionRegistry,
} from './DiagramNodeDefinition'
import { DEFAULT_CHILD_SLOT, getChildSlot } from './nodeChildSlots'
import { isDiagramFrameNode } from './diagramFrameNodes'
import { resolveAnimgraphSlotRules } from './animgraphSlotPolicy'
import {
  listAnimgraphPinClosureTypes,
  listAnimgraphSlotAddableTypes,
  listFloatingAnimgraphAddableRows,
  passesGlobalAddEligibility,
  pinFieldAsChildSlot,
  type AnimgraphSlotAddableRow,
} from './nodeAddSlotTypes'

export type AddableTypesGroup = {
  id: string
  slotLabel: string
  slotName?: string
  resolve: (ctx: NodeAddRulesContext) => AddProfileTypeResolveResult[]
}

function resolveResultDedupeKey(
  diagramNodeType: string,
  slotName?: string
): string {
  return `${diagramNodeType}#${slotName ?? ''}`
}

function slotNameFromResolveResult(result: AddProfileTypeResolveResult): string | undefined {
  return result.slot?.name
}

export function resolveAddableTypesGroups(
  groups: readonly AddableTypesGroup[],
  ctx: NodeAddRulesContext
): AddProfileTypeResolveResult[] {
  const seen = new Set<string>()
  const out: AddProfileTypeResolveResult[] = []
  for (const group of groups) {
    for (const result of group.resolve(ctx)) {
      const key = resolveResultDedupeKey(
        result.diagramNodeType,
        slotNameFromResolveResult(result) ?? group.slotName
      )
      if (seen.has(key)) continue
      seen.add(key)
      out.push(result)
    }
  }
  return out
}

export function lookupAddableType(
  groups: readonly AddableTypesGroup[],
  diagramNodeType: string,
  ctx: NodeAddRulesContext,
  fallback: AddProfileTypeResolveResult,
  preferredSlotName?: string
): AddProfileTypeResolveResult {
  const results = resolveAddableTypesGroups(groups, ctx)
  if (preferredSlotName) {
    const slotted = results.find(
      (r) => r.diagramNodeType === diagramNodeType && r.slot?.name === preferredSlotName
    )
    if (slotted) return slotted
  }
  return results.find((r) => r.diagramNodeType === diagramNodeType) ?? fallback
}

export { passesGlobalAddEligibility }

export type NodeAddRulesContext = {
  handlesRegistry: Map<string, AnimgraphNode>
  allNodes?: Map<string, RenderNode>
}

/** Handle write context — private to animgraph profiles / attach helpers. */
export type AnimgraphAttachContext = {
  parentHandle: AnimgraphNode
  parentType: string
  slot: ChildSlotDef
}

export type AddNodeDenialReason =
  | DiagramAddDenialReason
  | 'no-parent-slot'
  | 'slot-not-found'
  | 'type-not-allowed'
  | 'unique-conflict'
  | 'scalar-occupied'
  | 'unknown-animgraph-node-type'
  | 'parent-has-no-slots'
  | 'root-forbidden'

export type AddProfileTypeResolveResult =
  | {
      ok: true
      diagramNodeType: string
      animgraphNodeType?: string
      slot?: ChildSlotDef
      animgraphAttach?: AnimgraphAttachContext
    }
  | {
      ok: false
      diagramNodeType: string
      reasons: AddNodeDenialReason[]
      slot?: ChildSlotDef
    }

/**
 * Runtime add profile for a diagram selection.
 * diagramTarget is where the new RenderNode is parented (PG, Group, …).
 */
export type AddProfile = {
  id: string
  diagramTarget: RenderNode | null
  /** childSlots key on diagramTarget for the new node (default: children). */
  parentSlot?: string
  /** Optional label for tools UI, e.g. `animAnimNode_StateMachine.states`. */
  slotLabel?: string
  resolveTypes: (ctx: NodeAddRulesContext) => AddProfileTypeResolveResult[]
  canAddType: (
    diagramNodeType: string,
    ctx: NodeAddRulesContext,
    preferredSlotName?: string
  ) => AddProfileTypeResolveResult
}

export type ResolveAddProfileResult =
  | {
    status: 'deny'
    place: DiagramAddPlaceContext
    reasons: AddNodeDenialReason[]
  }
  | {
    status: 'ok'
    place: DiagramAddPlaceContext
    profile: AddProfile
  }

type AnimgraphAnchorMatcher = {
  id: string
  priority: number
  match: (anchor: RenderNode, ctx: NodeAddRulesContext) => boolean
  resolve: (
    anchor: RenderNode,
    ctx: NodeAddRulesContext
  ) => AddableTypesGroup | AddableTypesGroup[] | null
}

function handleIdFromRenderNode(node: RenderNode): string | undefined {
  const fromData = node.data?.originalNodeId
  if (typeof fromData === 'string' && fromData) return fromData
  const fromMeta = node.metadata?.handleId
  if (typeof fromMeta === 'string' && fromMeta) return fromMeta
  return undefined
}

function refId(entry: AnimgraphNodeLike): string | null {
  if (!entry || typeof entry !== 'object') return null
  if ('HandleRefId' in entry && entry.HandleRefId) return String(entry.HandleRefId)
  if ('HandleId' in entry && entry.HandleId) return String(entry.HandleId)
  return null
}

function siblingTypesInSlot(
  parent: AnimgraphNode,
  slot: ChildSlotDef,
  registry: Map<string, AnimgraphNode>
): string[] {
  const raw = parent.Data?.[slot.name]
  if (raw == null) return []

  const entries: AnimgraphNodeLike[] = Array.isArray(raw)
    ? (raw as AnimgraphNodeLike[])
    : [raw as AnimgraphNodeLike]

  const types: string[] = []
  for (const entry of entries) {
    const id = refId(entry)
    if (!id) continue
    const handle = registry.get(id)
    const t = handle?.Data?.$type
    if (typeof t === 'string') types.push(t)
  }
  return types
}

function isScalarOccupied(parent: AnimgraphNode, slot: ChildSlotDef): boolean {
  if (slot.kind !== 'scalar') return false
  const raw = parent.Data?.[slot.name]
  if (raw == null) return false
  if (typeof raw === 'object' && refId(raw as AnimgraphNodeLike)) return true
  return false
}

function resolveAnimgraphAttachContext(
  ownerRender: RenderNode,
  slotName: string | undefined,
  ctx: NodeAddRulesContext
): AnimgraphAttachContext | null {
  const handleId = handleIdFromRenderNode(ownerRender) ?? ownerRender.id
  const parentHandle = ctx.handlesRegistry.get(handleId)
  if (!parentHandle) return null

  const parentType = parentHandle.Data?.$type ?? ''
  const slots = NodeDefinitionRegistry.getChildSlots(
    NodeDefinitionRegistry.getNodeDefinition(parentType),
    parentType
  )
  if (slots.length === 0) return null

  const slot =
    (slotName ? slots.find((s) => s.name === slotName) : undefined) ?? slots[0]!

  if (slotName && slot.name !== slotName) return null

  return {
    parentHandle,
    parentType,
    slot,
  }
}

function createEmptyAddProfile(
  diagramTarget: RenderNode | null,
  parentSlot: string = DEFAULT_CHILD_SLOT
): AddProfile {
  return {
    id: 'empty',
    diagramTarget,
    parentSlot,
    resolveTypes: () => [],
    canAddType: (diagramNodeType) => ({
      ok: false,
      reasons: ['no-parent-slot'],
      diagramNodeType: diagramNodeType,
    }),
  }
}

function gateAnimgraphSlotRow(
  row: AnimgraphSlotAddableRow,
  attach: AnimgraphAttachContext,
  ctx: NodeAddRulesContext,
  strict: boolean
): AddProfileTypeResolveResult {
  const { parentHandle, slot } = attach
  const { diagramNodeType, animgraphNodeType } = row
  const resultSlot = row.pin ? pinFieldAsChildSlot(row.pin) : slot
  const reasons: AddNodeDenialReason[] = []
  /** Write into parent Data / nodesToInit only for strict contain lists. */
  const writeToSlot = row.origin === 'contain' && strict

  if (!passesGlobalAddEligibility(diagramNodeType) && !passesGlobalAddEligibility(animgraphNodeType)) {
    reasons.push('root-forbidden')
  }

  if (
    row.origin === 'contain' &&
    !NodeDefinitionRegistry.getNodeDefinition(animgraphNodeType) &&
    !DiagramNodeDefinitionRegistry.get(diagramNodeType)
  ) {
    reasons.push('unknown-animgraph-node-type')
  }

  if (writeToSlot) {
    if (isScalarOccupied(parentHandle, slot)) {
      reasons.push('scalar-occupied')
    }
    if (slot.uniqueTypes?.includes(animgraphNodeType)) {
      const siblings = siblingTypesInSlot(parentHandle, slot, ctx.handlesRegistry)
      if (siblings.includes(animgraphNodeType)) {
        reasons.push('unique-conflict')
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reasons, diagramNodeType, slot: resultSlot }
  }

  return {
    ok: true,
    diagramNodeType,
    animgraphNodeType,
    slot: resultSlot,
    ...(writeToSlot ? { animgraphAttach: attach } : {}),
  }
}

function createDiagramChildGroup(
  types: readonly string[],
  opts: {
    parent: RenderNode
    parentSlot: string
    uniqueTypes?: readonly string[]
  }
): AddableTypesGroup {
  const uniqueTypes = opts.uniqueTypes ?? []
  return {
    id: 'diagram-child',
    slotLabel: `${opts.parent.type}.${opts.parentSlot}`,
    resolve: () =>
      types.map((diagramNodeType) => {
        if (uniqueTypes.includes(diagramNodeType)) {
          const siblings = getChildSlot(opts.parent, opts.parentSlot)
          if (siblings.some((c) => c.type === diagramNodeType)) {
            return {
              ok: false as const,
              reasons: ['unique-conflict' as const],
              diagramNodeType,
            }
          }
        }
        return { ok: true as const, diagramNodeType }
      }),
  }
}

function createAnimgraphSlotGroup(attach: AnimgraphAttachContext): AddableTypesGroup {
  const { parentType, slot } = attach
  const slotRules = resolveAnimgraphSlotRules(parentType, slot.name)
  const rows = listAnimgraphSlotAddableTypes(slot, slotRules.strict)

  return {
    id: 'animgraph-node-slot',
    slotName: slot.name,
    slotLabel: `${parentType}.${slot.name}`,
    resolve: (ctx) =>
      rows.map((row) => gateAnimgraphSlotRow(row, attach, ctx, slotRules.strict)),
  }
}

function createComposedPlaceAddProfile(args: {
  id: string
  diagramTarget: RenderNode | null
  parentSlot?: string
  slotLabel?: string
  groups: AddableTypesGroup[]
}): AddProfile {
  const { groups } = args
  const parentSlot = args.parentSlot ?? DEFAULT_CHILD_SLOT
  if (groups.length === 0) {
    return createEmptyAddProfile(args.diagramTarget, parentSlot)
  }

  return {
    id: args.id,
    diagramTarget: args.diagramTarget,
    parentSlot,
    slotLabel: args.slotLabel,
    resolveTypes: (ctx) => resolveAddableTypesGroups(groups, ctx),
    canAddType: (diagramNodeType, ctx, preferredSlotName) =>
      lookupAddableType(
        groups,
        diagramNodeType,
        ctx,
        {
          ok: false,
          reasons: ['type-not-allowed'],
          diagramNodeType,
        },
        preferredSlotName
      ),
  }
}

function findPropertyGroupOnOwner(
  owner: RenderNode,
  slotName: string
): RenderNode | undefined {
  return getChildSlot(owner, DEFAULT_CHILD_SLOT).find(
    (c) => isPropertyGroupNode(c) && getPropertyGroupSlotName(c) === slotName
  )
}

function createAnimgraphSlotGroupFromPropertyGroup(
  propertyGroupNode: RenderNode,
  ctx: NodeAddRulesContext
): AddableTypesGroup | null {
  const owner = propertyGroupNode.parent
  const slotName = getPropertyGroupSlotName(propertyGroupNode)
  if (!owner || !slotName) return null

  const attach = resolveAnimgraphAttachContext(owner, slotName, ctx)
  if (!attach) return null

  return createAnimgraphSlotGroup(attach)
}

function createOwnerPropertyGroupGroups(
  owner: RenderNode,
  ctx: NodeAddRulesContext
): AddableTypesGroup[] {
  const handleId = handleIdFromRenderNode(owner) ?? owner.id
  const parentHandle = ctx.handlesRegistry.get(String(handleId))
  if (!parentHandle) return []

  const parentType = String(parentHandle.Data?.$type ?? '')
  const slots = NodeDefinitionRegistry.getChildSlots(
    NodeDefinitionRegistry.getNodeDefinition(parentType),
    parentType
  )
  if (slots.length === 0) return []

  return slots.map((slot) => ({
    id: `animgraph-owner-pg:${slot.name}`,
    slotName: slot.name,
    slotLabel: `${parentType}.${slot.name}`,
    resolve: (): AddProfileTypeResolveResult[] => {
      if (findPropertyGroupOnOwner(owner, slot.name)) {
        return [
          {
            ok: false,
            reasons: ['unique-conflict'],
            diagramNodeType: DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
            slot,
          },
        ]
      }
      return [
        {
          ok: true,
          diagramNodeType: DIAGRAM_NODE_TYPE_PROPERTY_GROUP,
          slot,
        },
      ]
    },
  }))
}

/**
 * Wrapper body: root Description/Entry + recursive projection pin closure
 * (all `role === 'pin'`, including pin-override). Floating — no parent Data write.
 */
function createAnimgraphGroupFromWrapper(
  wrapper: RenderNode,
  _ctx: NodeAddRulesContext
): AddableTypesGroup | null {
  const rootAnimgraphType =
    DiagramNodeDefinitionRegistry.getWrapperAnimgraphType(wrapper.type)
  if (!rootAnimgraphType) return null

  const rows = listAnimgraphPinClosureTypes(rootAnimgraphType, {
    includeRoot: true,
    pinMode: 'pin',
    diagramAsAnimgraph: true,
  })
  if (rows.length === 0) return null

  return {
    id: 'animgraph-wrapper-body',
    slotLabel: `${wrapper.type}.${DEFAULT_CHILD_SLOT}`,
    resolve: () =>
      rows.map((row) => {
        const { diagramNodeType, animgraphNodeType } = row
        const resultSlot = row.pin ? pinFieldAsChildSlot(row.pin) : undefined
        const reasons: AddNodeDenialReason[] = []

        if (
          !NodeDefinitionRegistry.getNodeDefinition(animgraphNodeType) &&
          !DiagramNodeDefinitionRegistry.get(diagramNodeType)
        ) {
          reasons.push('unknown-animgraph-node-type')
        }
        if (!passesGlobalAddEligibility(animgraphNodeType)) {
          reasons.push('root-forbidden')
        }

        // One root Description/Entry under the wrapper.
        if (animgraphNodeType === rootAnimgraphType) {
          const siblings = getChildSlot(wrapper, DEFAULT_CHILD_SLOT)
          const rootId = String(wrapper.data?.originalNodeId ?? '')
          const already = siblings.some((c) => {
            const id = handleIdFromRenderNode(c) ?? c.id
            return c.type === rootAnimgraphType || (rootId !== '' && id === rootId)
          })
          if (already) reasons.push('unique-conflict')
        }

        if (reasons.length > 0) {
          return {
            ok: false as const,
            reasons,
            diagramNodeType,
            animgraphNodeType,
            ...(resultSlot ? { slot: resultSlot } : {}),
          }
        }

        return {
          ok: true as const,
          diagramNodeType,
          animgraphNodeType,
          ...(resultSlot ? { slot: resultSlot } : {}),
        }
      }),
  }
}

/** PG | wrapper | node with handle in registry (pose / SM / State / …). */
function isAnimgraphRelatedNode(node: RenderNode, ctx: NodeAddRulesContext): boolean {
  if (isPropertyGroupNode(node)) return true
  if (DiagramNodeDefinitionRegistry.isWrapperType(node.type)) return true
  const id = handleIdFromRenderNode(node) ?? node.id
  return ctx.handlesRegistry.has(String(id))
}

function resolveClosestAnimgraphRelatedDiagramNode(
  diagramNode: RenderNode,
  ctx: NodeAddRulesContext
): RenderNode | undefined {
  let node: RenderNode | undefined = diagramNode
  while (node) {
    if (isAnimgraphRelatedNode(node, ctx)) {
      return node
    }
    if (!isDiagramFrameNode(node)) {
      return undefined
    }
    node = node.parent
  }
  return undefined
}

function collectDiagramGroupsForSelection(
  selection: RenderNode,
  parentSlot: string
): AddableTypesGroup[] {
  const types = DiagramNodeDefinitionRegistry.getAllowedTypesForDiagramSlot(
    selection.type,
    parentSlot
  )
  if (types.length === 0) return []
  return [
    createDiagramChildGroup(types, {
      parent: selection,
      parentSlot,
      uniqueTypes: DiagramNodeDefinitionRegistry.getUniqueTypesForDiagramSlot(
        selection.type,
        parentSlot
      ),
    }),
  ]
}

const ANIMGRAPH_ANCHOR_MATCHERS: AnimgraphAnchorMatcher[] = [
  {
    id: 'property-group',
    priority: 50,
    match: (anchor) => isPropertyGroupNode(anchor),
    resolve: (anchor, ctx) => createAnimgraphSlotGroupFromPropertyGroup(anchor, ctx),
  },
  {
    id: 'wrapper',
    priority: 40,
    match: (anchor) => DiagramNodeDefinitionRegistry.isWrapperType(anchor.type),
    resolve: (anchor, ctx) => createAnimgraphGroupFromWrapper(anchor, ctx),
  },
  {
    id: 'animgraph-owner',
    priority: 30,
    match: (anchor, ctx) => {
      const id = handleIdFromRenderNode(anchor) ?? anchor.id
      return ctx.handlesRegistry.has(String(id))
    },
    resolve: (anchor, ctx) => createOwnerPropertyGroupGroups(anchor, ctx),
  },
]

const ANIMGRAPH_ANCHOR_MATCHERS_BY_SLOT: Record<string, AnimgraphAnchorMatcher[]> = {
  [DEFAULT_CHILD_SLOT]: ANIMGRAPH_ANCHOR_MATCHERS,
}

const ANIMGRAPH_ANCHOR_MATCHERS_BY_SLOT_SORTED = Object.fromEntries(
  Object.entries(ANIMGRAPH_ANCHOR_MATCHERS_BY_SLOT).map(([slot, matchers]) => [slot, matchers.sort((a, b) => b.priority - a.priority)])
)

function resolveAnimgraphAddableGroups(
  diagramNodeSlot: string,
  anchor: RenderNode,
  ctx: NodeAddRulesContext
): AddableTypesGroup[] {
  const matchers = ANIMGRAPH_ANCHOR_MATCHERS_BY_SLOT_SORTED[diagramNodeSlot]
  if (!matchers) return []

  for (const matcher of matchers) {
    if (!matcher.match(anchor, ctx)) continue
    const resolved = matcher.resolve(anchor, ctx)
    if (!resolved) continue
    return Array.isArray(resolved) ? resolved : [resolved]
  }

  return []
}

function createFloatingAnimgraphGroup(): AddableTypesGroup {
  const rows = listFloatingAnimgraphAddableRows()
  return {
    id: 'floating-animgraph',
    slotLabel: 'floating',
    resolve: () =>
      rows.map((row) => ({
        ok: true as const,
        diagramNodeType: row.diagramNodeType,
        animgraphNodeType: row.animgraphNodeType,
      })),
  }
}

/** Ambient diagram-only types — always addable except onto portals. */
export function collectAmbientUiTypes(place: DiagramAddPlaceContext): string[] {
  if (place.diagramTarget && isDiagramPortalNode(place.diagramTarget)) return []
  return [DIAGRAM_NODE_TYPE_GROUP, DIAGRAM_NODE_TYPE_NOTE]
}

export function mergeProfileAndAmbientUiTypes(
  profileTypes: readonly string[],
  place: DiagramAddPlaceContext
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of profileTypes) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  for (const t of collectAmbientUiTypes(place)) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function mergeAmbientResolves(
  place: DiagramAddPlaceContext,
  resolves: AddProfileTypeResolveResult[]
): AddProfileTypeResolveResult[] {
  const seen = new Set<string>()
  for (const result of resolves) {
    if (result.ok) seen.add(result.diagramNodeType)
  }
  const extra: AddProfileTypeResolveResult[] = []
  for (const diagramNodeType of collectAmbientUiTypes(place)) {
    if (seen.has(diagramNodeType)) continue
    seen.add(diagramNodeType)
    extra.push({ ok: true, diagramNodeType })
  }
  return extra.length === 0 ? resolves : [...resolves, ...extra]
}

export function tryAmbientCanAdd(
  place: DiagramAddPlaceContext,
  diagramNodeType: string
): Extract<AddProfileTypeResolveResult, { ok: true }> | null {
  if (!collectAmbientUiTypes(place).includes(diagramNodeType)) return null
  return { ok: true, diagramNodeType }
}

/**
 * place (diagramTarget + parentSlot from view) → AddProfile | deny.
 *
 * animgraph capacity from closest related ancestor of diagramTarget.
 */
export function resolveAddProfile(
  ctx: NodeAddRulesContext,
  place: DiagramAddPlaceContext
): ResolveAddProfileResult {
  const { diagramTarget, parentSlot } = place
  if (!diagramTarget) {
    return {
      status: 'ok',
      place,
      profile: createEmptyAddProfile(null, place.parentSlot),
    }
  }

  const groups: AddableTypesGroup[] = []

  let profileId = 'diagram-place'
  let slotLabel: string | undefined = DiagramNodeDefinitionRegistry.get(diagramTarget.type)
    ? `${diagramTarget.type}.${parentSlot}`
    : undefined

  // Animgraph groups first: resolveAddableTypesGroups is first-wins on
  // diagramNodeType, so wrapper/PG rows must beat diagram-child duplicates.
  const closestAnimgraphRelatedDiagramNode =
    resolveClosestAnimgraphRelatedDiagramNode(diagramTarget, ctx)
  if (closestAnimgraphRelatedDiagramNode) {
    const animgraphGroups = resolveAnimgraphAddableGroups(
      parentSlot,
      closestAnimgraphRelatedDiagramNode,
      ctx
    )
    if (animgraphGroups.length > 0) {
      groups.push(...animgraphGroups)
      profileId = animgraphGroups[0]!.id
      slotLabel = animgraphGroups[0]!.slotLabel ?? slotLabel
    }
  } else if (isDiagramFrameNode(diagramTarget)) {
    groups.push(createFloatingAnimgraphGroup())
    profileId = 'floating-animgraph'
    slotLabel = 'floating'
  }

  groups.push(...collectDiagramGroupsForSelection(diagramTarget, parentSlot))

  return {
    status: 'ok',
    place,
    profile: createComposedPlaceAddProfile({
      id: profileId,
      diagramTarget,
      parentSlot,
      slotLabel,
      groups,
    }),
  }
}
