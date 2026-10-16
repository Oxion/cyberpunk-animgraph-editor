import { computed, ref, shallowRef, watch } from 'vue'
import { MAIN_DIAGRAM_ID } from '../utils/graph/diagramTypes'
import {
  activeDiagramId,
  getRenderData,
  listDiagramIds,
  mainDiagramId,
  projectRef,
} from '../stores/graphProject'
import type { SimRunnerSlotsConfigJson } from '../utils/graph/diagramTypes'
import {
  ClipLibrary,
  DEFAULT_ANIM_SETUP_PRIORITY,
  type AnimClipSetupJson,
  type AnimSetupEntryView,
  type ClipLibraryStats,
  type ClipMeta,
  type ClipSetMembership,
} from '../utils/sim/clipLibrary'
import {
  clipLibraryToCompactJson,
  loadAnimsJsonIntoLibrary,
  loadCompactClipLibraryJson,
} from '../utils/sim/parseAnimsJson'
import {
  AnimDatabaseLibrary,
  animDatabaseLibraryToCompactJson,
  loadAnimDatabaseCsvJson,
  loadCompactAnimDatabaseLibraryJson,
  type AnimDatabaseLibraryJson,
  type AnimDatabaseStats,
} from '../utils/sim/animDatabase'
import { SimClock } from '../utils/sim/SimClock'
import {
  SimGraphRunner,
  collectGraphSlotNames,
  type SimGraphSlotHost,
} from '../utils/sim/SimGraphRunner'
import { SimInputBoard } from '../utils/sim/SimInputBoard'
import {
  IDENTITY_QUAT_VEC4,
  ZERO_VEC4,
  type SimVec4,
} from '../utils/sim/evalAnimMathExpressionVector'
import { collectDiscoveredInputs } from '../utils/sim/SimStateMachine'
import type { SimSnapshot } from '../utils/sim/simTypes'
import { emptySimSnapshot } from '../utils/sim/simSnapshot'
import { isSimSampleLogEnabled } from '../utils/sim/simSampleLog'
import { RigLibrary, type RigLibraryJson, type RigEntry, type RigEntryView } from '../utils/sim/rigResource'
import {
  ClipPoseLibrary,
  type ClipPoseLibraryJson,
  type ClipPoseSetView,
} from '../utils/sim/clipPoseLibrary'
import type { Pose } from '../utils/sim/pose'
import {
  buildRigBonesStats,
  buildStackBonesStats,
  buildStackNamesStats,
  buildTrackStackStats,
  poseRefKey,
  type DerivedPoseRef,
  type DerivedPoseStats,
  type DerivedPoseStatsNeed,
} from '../utils/sim/poseDerivedStats'

function resolveRootDiagramId(ids: string[]): string | null {
  if (!ids.length) return null
  const mainId = mainDiagramId.value
  if (mainId && ids.includes(mainId)) return mainId
  if (ids.includes(MAIN_DIAGRAM_ID)) return MAIN_DIAGRAM_ID
  return ids[0] ?? null
}

/** Case-insensitive diagram id lookup (GraphSlot.name ↔ project diagram id). */
function findDiagramIdBySlotName(ids: string[], slotName: string): string | undefined {
  const want = slotName.trim()
  if (!slotName || slotName === 'None') return undefined

  if (ids.includes(slotName)) return want

  const lower = slotName.toLowerCase()
  return ids.find((id) => id.toLowerCase() === lower)
}

/** Fixed root execution-slot id. */
export const ROOT_RUNNER_ID = 'root'

export type { SimRunnerSlotsConfigJson }

/**
 * Remap / scrub diagram ids inside persisted runnerSlots (pairs with serializeRunnerSlots).
 * - Remaps `diagramId` and `slotDiagramIds` values via idMap
 * - Drops runner entries whose diagramId is not in survivingIds
 * - Omits slotDiagramIds values that do not survive
 * - Drops slotRunnerIds pointing at removed runner entries
 */
export function rewriteRunnerSlotsDiagramIds(
  cfg: SimRunnerSlotsConfigJson,
  idMap: ReadonlyMap<string, string> | Record<string, string>,
  survivingIds: ReadonlySet<string>
): SimRunnerSlotsConfigJson {
  const mapGet = (oldId: string): string | undefined => {
    if (idMap instanceof Map) return idMap.get(oldId)
    return (idMap as Record<string, string>)[oldId]
  }

  const mapDiagramId = (raw: string): string | null => {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const next = mapGet(trimmed) ?? trimmed
    return survivingIds.has(next) ? next : null
  }

  if (cfg.rootDetached === true) {
    return {
      rootRunnerId: cfg.rootRunnerId ?? ROOT_RUNNER_ID,
      rootDetached: true,
      runners: {},
    }
  }

  const srcRunners = cfg.runners && typeof cfg.runners === 'object' ? cfg.runners : {}
  const runnersOut: SimRunnerSlotsConfigJson['runners'] = {}

  for (const [runnerId, entry] of Object.entries(srcRunners)) {
    if (!entry || typeof entry !== 'object') continue
    const diagRaw = typeof entry.diagramId === 'string' ? entry.diagramId : ''
    const diagramId = mapDiagramId(diagRaw)
    if (!diagramId) continue

    const slotDiagramIds: Record<string, string> = {}
    if (entry.slotDiagramIds && typeof entry.slotDiagramIds === 'object') {
      for (const [slot, diag] of Object.entries(entry.slotDiagramIds)) {
        const s = slot.trim()
        if (!s || typeof diag !== 'string') continue
        const mapped = mapDiagramId(diag)
        if (mapped) slotDiagramIds[s] = mapped
      }
    }

    runnersOut[runnerId] = {
      diagramId,
      ...(Array.isArray(entry.slotInitialized)
        ? { slotInitialized: [...entry.slotInitialized] }
        : {}),
      slotDiagramIds,
      slotRunnerIds:
        entry.slotRunnerIds && typeof entry.slotRunnerIds === 'object'
          ? { ...entry.slotRunnerIds }
          : {},
    }
  }

  // Drop slot→child links whose child runner was removed.
  const keptRunnerIds = new Set(Object.keys(runnersOut))
  for (const entry of Object.values(runnersOut)) {
    if (!entry.slotRunnerIds) continue
    const next: Record<string, string> = {}
    for (const [slot, childId] of Object.entries(entry.slotRunnerIds)) {
      const s = slot.trim()
      const c = typeof childId === 'string' ? childId.trim() : ''
      if (!s || !c || !keptRunnerIds.has(c)) continue
      next[s] = c
    }
    entry.slotRunnerIds = next
  }

  return {
    rootRunnerId: cfg.rootRunnerId ?? ROOT_RUNNER_ID,
    runners: runnersOut,
  }
}

export type SimSlotRunnerInfo = {
  slotName: string
  runnerId: string
  diagramId: string
}

/** Bound runner tree node for UI pickers (diagram set). */
export type SimRunnerTreeNode = {
  runnerId: string
  diagramId: string
  /** `root` or GraphSlot name. */
  label: string
  /** e.g. `root (main)` / `WORKSPOT (ws)`. */
  title: string
  children: SimRunnerTreeNode[]
}

/** Flat runner option with ancestry path label (at-node / overlay pickers). */
export type SimRunnerPathOption = {
  runnerId: string
  diagramId: string
  /** e.g. `root(main) -> ranged(ranged)`. */
  title: string
}

type DerivedCacheEntry = DerivedPoseStats & {
  /** Resolved once per cache key. */
  pose?: Pose | null
  resolved?: boolean
}

/** Sim runtime composable. Prefer singleton via `stores/animgraphSim`. */
export function useAnimgraphSim() {
  const clock = shallowRef(new SimClock())
  const board = shallowRef(new SimInputBoard())
  /** One runner per execution slot (arbitrary runnerId). */
  const runners = new Map<string, SimGraphRunner>()
  let nextSlotRunnerSeq = 1
  const clipLibrary = shallowRef(new ClipLibrary())
  const animDbLibrary = shallowRef(new AnimDatabaseLibrary())
  const rigLibrary = shallowRef(new RigLibrary())
  const clipPoseLibrary = shallowRef(new ClipPoseLibrary())
  /** Bump to refresh clip UI after library mutates in place. */
  const clipLibraryRevision = ref(0)
  const animDbRevision = ref(0)
  const rigRevision = ref(0)
  const clipPoseRevision = ref(0)
  /** Per-runner snapshots from last publish. */
  const snapshotsByRunner = shallowRef<Record<string, SimSnapshot>>({})
  /**
   * Bumped when runner Map / slot→diagram topology changes.
   * `runners` is a plain Map — UI trees must depend on this, not only snapshots.
   */
  const runnersRev = ref(0)
  const bumpRunners = () => {
    runnersRev.value++
  }
  /** Bumped each publish; stamped onto every diagram snapshot. */
  let poseGenCounter = 0
  /** Last stack-capture handle ids (selection); first is preferred HUD pose. */
  const stackCaptureHandleIds = ref<string[]>([])
  /** Cache: poseGen|diagramId|poseKey → resolved pose + filled derived fields. */
  const derivedPoseCache = new Map<string, DerivedCacheEntry>()
  let derivedPoseCacheGen = -1
  const enabled = ref(false)
  const active = ref(false)
  /**
   * Mirror of `clock.playing` — SimClock mutates in place on a shallowRef,
   * so UI must not read `clock.value.playing` without this (or snapshots).
   */
  const playing = ref(false)
  const syncPlaying = () => {
    playing.value = clock.value.playing
  }
  const eventDraft = ref('')
  /** Valued timeline event payload for AnimNode_EventValue inject */
  const eventValueDraft = ref(0)
  const featureDrafts = ref<Record<string, number>>({})
  /** Vector4 AnimFeature drafts: feature\\0property → {x,y,z,w} */
  const vectorFeatureDrafts = ref<Record<string, SimVec4>>({})
  const quatFeatureDrafts = ref<Record<string, SimVec4>>({})
  /** Bool AnimFeature drafts: feature\\0property → boolean */
  const boolFeatureDrafts = ref<Record<string, boolean>>({})
  /** CName AnimFeature drafts: feature\\0property → string */
  const stringFeatureDrafts = ref<Record<string, string>>({})
  const floatVarDrafts = ref<Record<string, number>>({})
  const vectorVarDrafts = ref<Record<string, SimVec4>>({})
  const quatVarDrafts = ref<Record<string, SimVec4>>({})
  const boolVarDrafts = ref<Record<string, boolean>>({})
  const intVarDrafts = ref<Record<string, number>>({})
  /** AnimNode_TagValue data-flow tags */
  const tagValueDrafts = ref<Record<string, number>>({})
  /** StaticSwitch entity tags (Component/Visual/Rig) — name → present */
  const entityTagDrafts = ref<Record<string, boolean>>({})
  /** SetAnimWrapperWeight mock: name → weight (active if >= 0.5) */
  const wrapperWeightDrafts = ref<Record<string, number>>({})
  /** Sample-path diagnostics (Blend2 null inputs, …). Off by default. */
  const sampleWarningsEnabled = ref(false)
  const updateWarningsEnabled = ref(false)

  let raf = 0
  let lastTs = 0
  /** Runner ids currently stepping via GraphSlot nest — cycle guard. */
  const nestStack: string[] = []

  const bumpClips = () => {
    clipLibraryRevision.value++
  }

  const bumpAnimDb = () => {
    animDbRevision.value++
  }

  const bumpRigs = () => {
    rigRevision.value++
  }

  /** Cached project pose payload (invalidated on bumpClipPose). */
  let cachedClipPoseJson: ClipPoseLibraryJson | null = null
  let cachedClipPoseCompact: string | null = null
  let cachedClipPoseAtRev = -1

  const getCachedClipPoseLibraryJson = (): ClipPoseLibraryJson | undefined => {
    if (clipPoseLibrary.value.size === 0) return undefined
    if (cachedClipPoseJson == null || cachedClipPoseAtRev !== clipPoseRevision.value) {
      cachedClipPoseJson = clipPoseLibrary.value.toJson()
      cachedClipPoseCompact = null
      cachedClipPoseAtRev = clipPoseRevision.value
    }
    return cachedClipPoseJson
  }

  /** Compact JSON text for sidecar save (no pretty-print). */
  const getCachedClipPoseCompactText = (): string | null => {
    const json = getCachedClipPoseLibraryJson()
    if (json == null || !(json.sets?.length > 0)) return null
    if (cachedClipPoseCompact == null || cachedClipPoseAtRev !== clipPoseRevision.value) {
      cachedClipPoseCompact = JSON.stringify(json)
      cachedClipPoseAtRev = clipPoseRevision.value
    }
    return cachedClipPoseCompact
  }

  const bumpClipPose = () => {
    clipPoseRevision.value++
    cachedClipPoseJson = null
    cachedClipPoseCompact = null
  }

  const syncSampleResourcesToRunners = () => {
    const rig = rigLibrary.value.getActive()
    for (const runner of runners.values()) {
      runner.setClipPoseLibrary(clipPoseLibrary.value)
      runner.setActiveRig(rig)
    }
  }

  const isWrapperActive = (name: string) => {
    const w = wrapperWeightDrafts.value[name]
    if (w !== undefined) return w >= SimInputBoard.WRAPPER_ACTIVE_THRESHOLD
    return board.value.isWrapperActive(name)
  }

  const syncRunnerResources = (r: SimGraphRunner) => {
    r.setClipLibrary(clipLibrary.value)
    r.setAnimDatabaseLibrary(animDbLibrary.value)
    r.setClipPoseLibrary(clipPoseLibrary.value)
    r.setActiveRig(rigLibrary.value.getActive())
    r.sampleWarningsEnabled = sampleWarningsEnabled.value
    r.updateWarningsEnabled = updateWarningsEnabled.value
  }

  const allocSlotRunnerId = (): string => `s${nextSlotRunnerSeq++}`

  /**
   * Host mirror when root is destroyed (explicit None): Diagrams UI + persistence
   * without a live unbound runner in the map.
   */
  /** Explicit root None — no live root; persisted as `rootDetached` (not empty diagramId). */
  let rootDetached = false

  /** Create/get runner shell (not yet bound). Prefer `setRunnerDiagramId` for bind. */
  const ensureRunner = (runnerId: string): SimGraphRunner => {
    let r = runners.get(runnerId)
    if (!r) {
      r = new SimGraphRunner(runnerId)
      runners.set(r.runnerId, r)
    }
    return r
  }

  const getRootRunnerId = () => ROOT_RUNNER_ID

  /** Prefer root if it runs this diagram; else first match. */
  const findRunnerByDiagramId = (diagramId: string): SimGraphRunner | null => {
    if (!diagramId) return null
    const root = runners.get(ROOT_RUNNER_ID)
    if (root?.diagramId === diagramId) return root
    for (const r of runners.values()) {
      if (r.diagramId === diagramId) return r
    }
    return null
  }

  const findRunnersByDiagramId = (diagramId: string): SimGraphRunner[] => {
    if (!diagramId) return []
    const out: SimGraphRunner[] = []
    for (const r of runners.values()) {
      if (r.diagramId === diagramId) out.push(r)
    }
    return out
  }

  /** Depth-first dispose + delete (including root). Unlinks from parent's slotRunnerIds. */
  const destroyRunner = (runnerId: string) => {
    const runner = runners.get(runnerId)
    if (!runner) return

    for (const childId of [...runner.slotRunnerIds.values()]) {
      if (childId) destroyRunner(childId)
    }

    // Detach from parent slot map (stale ids otherwise survive serialize).
    for (const parent of runners.values()) {
      if (parent === runner) continue
      for (const [slot, childId] of [...parent.slotRunnerIds.entries()]) {
        if (childId === runnerId) parent.setSlotRunnerId(slot, null)
      }
    }

    runner.dispose()
    runners.delete(runnerId)

    if (snapshotsByRunner.value[runnerId]) {
      const next = { ...snapshotsByRunner.value }
      delete next[runnerId]
      snapshotsByRunner.value = next
    }
  }

  /**
   * Bind runner to a diagram, or destroy when empty (None).
   * `diagramId` is only written inside `runner.bind`.
   */
  const setRunnerDiagramId = (
    runnerId: string,
    diagramId?: string | null,
    opts?: { skipMaterialize?: boolean }
  ): SimGraphRunner | null => {
    const nextDiagramId = (diagramId ?? '').trim()

    if (!nextDiagramId) {
      if (runnerId === ROOT_RUNNER_ID) rootDetached = true
      destroyRunner(runnerId)
      bumpRunners()
      return null
    }

    const nextDiagramData = getRenderData(nextDiagramId)
    if (!nextDiagramData) {
      console.warn(
        `[sim] setRunnerDiagramId: no RenderData for diagramId="${nextDiagramId}" (runner="${runnerId}")`
      )
      if (runnerId === ROOT_RUNNER_ID) rootDetached = true
      destroyRunner(runnerId)
      bumpRunners()
      return null
    }

    if (runnerId === ROOT_RUNNER_ID) rootDetached = false
    const simGraphRunner = ensureRunner(runnerId)
    // Libraries/rig before bind so compile / StaticSwitch see them.
    syncRunnerResources(simGraphRunner)
    simGraphRunner.bind(nextDiagramId, nextDiagramData, board.value)
    if (!opts?.skipMaterialize) {
      materializeSlotTree(runnerId)
    }
    bumpRunners()
    return simGraphRunner
  }

  /**
   * Ensure a child runner exists for a GraphSlot when it has a diagram.
   * Initialized None → destroy child, clear slotRunnerId, return null.
   */
  const ensureSlotRunner = (
    parentSimGraphRunner: SimGraphRunner,
    slotName: string
  ): string | null => {
    if (!slotName || slotName === 'None') return null

    let diagramId = parentSimGraphRunner.getSlotDiagramId(slotName) ?? ''
    if (!diagramId && !parentSimGraphRunner.isSlotInitialized(slotName)) {
      const matched = findDiagramIdBySlotName(listDiagramIds.value, slotName)
      if (matched) {
        diagramId = matched
        parentSimGraphRunner.setSlotDiagramId(slotName, matched)
      }
    }

    // Explicit / resolved None — no live child.
    if (!diagramId) {
      if (parentSimGraphRunner.isSlotInitialized(slotName)) {
        const slotSimGraphRunner = parentSimGraphRunner.getSlotRunnerId(slotName)
        if (slotSimGraphRunner) {
          destroyRunner(slotSimGraphRunner)
          parentSimGraphRunner.setSlotRunnerId(slotName, null)
        }
      }
      return null
    }

    let slotSimGraphRunnerId = parentSimGraphRunner.getSlotRunnerId(slotName)
    if (!slotSimGraphRunnerId) {
      slotSimGraphRunnerId = allocSlotRunnerId()
      parentSimGraphRunner.setSlotRunnerId(slotName, slotSimGraphRunnerId)
    }

    const child = runners.get(slotSimGraphRunnerId)
    if (!child || child.diagramId !== diagramId) {
      // Never cascade materialize here — rebind/BFS or materializeSlotTree owns that.
      setRunnerDiagramId(slotSimGraphRunnerId, diagramId, { skipMaterialize: true })
    }
    return runners.has(slotSimGraphRunnerId) ? slotSimGraphRunnerId : null
  }

  /** Eagerly create child runners for GraphSlot names on parent's bound diagram (one level). */
  const materializeSlotRunners = (parentId: string) => {
    const parentSimGraphRunner = runners.get(parentId)
    if (!parentSimGraphRunner?.diagramId) return

    const diagramData = getRenderData(parentSimGraphRunner.diagramId)
    const diagramGraphSlotNames = collectGraphSlotNames(diagramData?.handlesRegistry)
    const known = new Set(diagramGraphSlotNames)

    for (const name of diagramGraphSlotNames) {
      ensureSlotRunner(parentSimGraphRunner, name)
    }

    let pruned = false
    for (const [slotName, childId] of [...parentSimGraphRunner.slotRunnerIds.entries()]) {
      if (known.has(slotName)) continue
      if (childId) destroyRunner(childId)
      parentSimGraphRunner.setSlotRunnerId(slotName, null)
      parentSimGraphRunner.forgetSlotDiagram(slotName)
      pruned = true
    }
    if (pruned || diagramGraphSlotNames.length) bumpRunners()
  }

  /** BFS materialize from a runner (cycle-safe). */
  const materializeSlotTree = (startId: string) => {
    const visited = new Set<string>()
    const queue = [startId]
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      materializeSlotRunners(id)
      const r = runners.get(id)
      if (!r) continue
      for (const childId of r.slotRunnerIds.values()) {
        if (childId && !visited.has(childId)) queue.push(childId)
      }
    }
  }

  /**
   * Slots on a bound parent: GraphSlot names + initialized Nones.
   * None slots may have empty runnerId (no live child).
   */
  const listSlotRunners = (parentId: string): SimSlotRunnerInfo[] => {
    const parent = runners.get(parentId)
    if (!parent?.diagramId) return []
    const data = getRenderData(parent.diagramId)
    const names = new Set<string>(collectGraphSlotNames(data?.handlesRegistry))
    for (const s of parent.slotInitialized) names.add(s)
    for (const s of parent.slotRunnerIds.keys()) names.add(s)
    const out: SimSlotRunnerInfo[] = []
    for (const slotName of names) {
      if (!slotName || slotName === 'None') continue
      const runnerId = parent.getSlotRunnerId(slotName) ?? ''
      const child = runnerId ? runners.get(runnerId) : undefined
      out.push({
        slotName,
        runnerId,
        diagramId: child?.diagramId ?? parent.getSlotDiagramId(slotName) ?? '',
      })
    }
    return out
  }

  const setSlotDiagramId = (
    parentRunnerId: string,
    slotName: string,
    diagramId: string
  ) => {
    const parentSimGraphRunner = runners.get(parentRunnerId)
    if (!parentSimGraphRunner) {
      console.warn(
        `[sim] setSlotDiagramId: missing parent runner "${parentRunnerId}"`
      )
      return
    }
    const want = slotName.trim()
    if (!want || want === 'None') return

    const next = diagramId.trim()
    // Marks initialized; empty next = explicit None (passthrough, no auto-default).
    parentSimGraphRunner.setSlotDiagramId(want, next || null)
    if (!next) {
      const existing = parentSimGraphRunner.getSlotRunnerId(want)
      if (existing) destroyRunner(existing)
      parentSimGraphRunner.setSlotRunnerId(want, null)
      bumpRunners()
      return
    }
    const childId = ensureSlotRunner(parentSimGraphRunner, want)
    if (childId) setRunnerDiagramId(childId, next)
    else bumpRunners()
  }

  /** Bound runners only (diagram set) — for Skeleton / Status pickers. */
  const listBoundRunnerTree = (): SimRunnerTreeNode | null => {
    const rootId = ROOT_RUNNER_ID
    const root = runners.get(rootId)
    if (!root?.diagramId) return null

    const build = (
      runnerId: string,
      label: string,
      visited: Set<string>
    ): SimRunnerTreeNode | null => {
      if (visited.has(runnerId)) return null
      visited.add(runnerId)
      const r = runners.get(runnerId)
      if (!r?.diagramId) return null
      const children: SimRunnerTreeNode[] = []
      for (const slot of listSlotRunners(runnerId)) {
        if (!slot.diagramId) continue
        const child = build(slot.runnerId, slot.slotName, visited)
        if (child) children.push(child)
      }
      return {
        runnerId,
        diagramId: r.diagramId,
        label,
        title: `${label} (${r.diagramId})`,
        children,
      }
    }

    return build(rootId, 'root', new Set())
  }

  /**
   * Bound runner tree pruned to runners executing `diagramId` (at-node picker).
   * Non-matching ancestors are dropped; their matching descendants are promoted.
   * Multiple top-level matches are wrapped under a synthetic group node.
   */
  const listBoundRunnerTreeForDiagram = (
    diagramId: string
  ): SimRunnerTreeNode | null => {
    const want = diagramId.trim()
    if (!want) return null
    const tree = listBoundRunnerTree()
    if (!tree) return null

    const prune = (node: SimRunnerTreeNode): SimRunnerTreeNode[] => {
      const kids = node.children.flatMap(prune)
      if (node.diagramId === want) {
        return [{ ...node, children: kids }]
      }
      return kids
    }

    const roots = prune(tree)
    if (!roots.length) return null
    if (roots.length === 1) return roots[0]!
    return {
      runnerId: `__diagram:${want}`,
      diagramId: want,
      label: want,
      title: want,
      children: roots,
    }
  }

  /**
   * Flat list of bound runners with full ancestry path titles.
   * When `diagramId` is set, only runners executing that diagram are included
   * (path still shows ancestors).
   */
  const listBoundRunnerPaths = (
    diagramId?: string | null
  ): SimRunnerPathOption[] => {
    const tree = listBoundRunnerTree()
    if (!tree) return []
    const want = diagramId?.trim() || ''
    const out: SimRunnerPathOption[] = []
    const walk = (node: SimRunnerTreeNode, pathPrefix: string) => {
      const seg = `${node.label}(${node.diagramId})`
      const path = pathPrefix ? `${pathPrefix} -> ${seg}` : seg
      if (!want || node.diagramId === want) {
        out.push({
          runnerId: node.runnerId,
          diagramId: node.diagramId,
          title: path,
        })
      }
      for (const child of node.children) walk(child, path)
    }
    walk(tree, '')
    return out
  }

  const getSlotDiagramId = (parentRunnerId: string, slotName: string) =>
    runners.get(parentRunnerId)?.getSlotDiagramId(slotName)

  const getSlotRunnerId = (parentRunnerId: string, slotName: string) =>
    runners.get(parentRunnerId)?.getSlotRunnerId(slotName)

  /** Root runner for drivers (LookAt / MixerSlot attach). */
  /** Live root only (null when destroyed / explicit None). */
  const getPrimaryRunner = () => runners.get(ROOT_RUNNER_ID) ?? null

  const getRunner = (runnerId: string | null | undefined) =>
    runnerId ? runners.get(runnerId) ?? null : null

  /**
   * Host / SimPanel view: always root runner snap + live clock fields.
   * Diagram-scoped UI must use `snapshotForRunner` / `snapshotForDiagram`
   * (do not guess via activeDiagramId here).
   */
  const snapshot = computed((): SimSnapshot => {
    const rootSnap = snapshotsByRunner.value[ROOT_RUNNER_ID]
    return {
      ...(rootSnap ?? emptySimSnapshot()),
      time: clock.value.time,
      playing: playing.value,
      speed: clock.value.speed,
    }
  })

  const discovered = computed(() => {
    void projectRef.value
    void clipLibraryRevision.value
    void entityTagDrafts.value
    const features: { feature: string; property: string }[] = []
    const vectorFeatures: { feature: string; property: string }[] = []
    const quatFeatures: { feature: string; property: string }[] = []
    const boolFeatures: { feature: string; property: string }[] = []
    const stringFeatures: { feature: string; property: string }[] = []
    const floatVars: string[] = []
    const vectorVars: string[] = []
    const quatVars: string[] = []
    const transformVars: string[] = []
    const boolVars: string[] = []
    const intVars: string[] = []
    const wrappers: string[] = []
    const events: string[] = []
    const tags: string[] = []
    const entityTags: string[] = []
    const featSeen = new Set<string>()
    const vecFeatSeen = new Set<string>()
    const quatFeatSeen = new Set<string>()
    const boolFeatSeen = new Set<string>()
    const stringFeatSeen = new Set<string>()
    const mergeUnique = (into: string[], seen: Set<string>, names: string[]) => {
      for (const n of names) {
        const k = n.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        into.push(n)
      }
    }
    const floatSeen = new Set<string>()
    const vectorSeen = new Set<string>()
    const quatVarSeen = new Set<string>()
    const transformSeen = new Set<string>()
    const boolSeen = new Set<string>()
    const intSeen = new Set<string>()
    const wrapSeen = new Set<string>()
    const eventSeen = new Set<string>()
    const tagSeen = new Set<string>()
    const entityTagSeen = new Set<string>()

    for (const id of listDiagramIds.value) {
      const handles = getRenderData(id)?.handlesRegistry
      if (!handles) continue
      const fromGraph = collectDiscoveredInputs(handles)
      for (const f of fromGraph.features) {
        const k = `${f.feature}\0${f.property}`.toLowerCase()
        if (featSeen.has(k)) continue
        featSeen.add(k)
        features.push(f)
      }
      for (const f of fromGraph.vectorFeatures) {
        const k = `${f.feature}\0${f.property}`.toLowerCase()
        if (vecFeatSeen.has(k)) continue
        vecFeatSeen.add(k)
        vectorFeatures.push(f)
      }
      for (const f of fromGraph.quatFeatures) {
        const k = `${f.feature}\0${f.property}`.toLowerCase()
        if (quatFeatSeen.has(k)) continue
        quatFeatSeen.add(k)
        quatFeatures.push(f)
      }
      for (const f of fromGraph.boolFeatures) {
        const k = `${f.feature}\0${f.property}`.toLowerCase()
        if (boolFeatSeen.has(k)) continue
        boolFeatSeen.add(k)
        boolFeatures.push(f)
      }
      for (const f of fromGraph.stringFeatures) {
        const k = `${f.feature}\0${f.property}`.toLowerCase()
        if (stringFeatSeen.has(k)) continue
        stringFeatSeen.add(k)
        stringFeatures.push(f)
      }
      mergeUnique(floatVars, floatSeen, fromGraph.floatVars)
      mergeUnique(vectorVars, vectorSeen, fromGraph.vectorVars)
      mergeUnique(quatVars, quatVarSeen, fromGraph.quatVars)
      mergeUnique(transformVars, transformSeen, fromGraph.transformVars)
      mergeUnique(boolVars, boolSeen, fromGraph.boolVars)
      mergeUnique(intVars, intSeen, fromGraph.intVars)
      mergeUnique(wrappers, wrapSeen, fromGraph.wrappers)
      mergeUnique(events, eventSeen, fromGraph.events)
      mergeUnique(tags, tagSeen, fromGraph.tags)
      mergeUnique(entityTags, entityTagSeen, fromGraph.entityTags)
    }
    // Keep manually added entity tags in the list
    mergeUnique(entityTags, entityTagSeen, Object.keys(entityTagDrafts.value))

    const fromClips = clipLibrary.value.eventNames()
    const fromSetupWrappers = clipLibrary.value.wrapperNames()
    mergeUnique(events, eventSeen, fromClips)
    mergeUnique(wrappers, wrapSeen, fromSetupWrappers)

    features.sort((a, b) =>
      `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
    )
    vectorFeatures.sort((a, b) =>
      `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
    )
    quatFeatures.sort((a, b) =>
      `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
    )
    boolFeatures.sort((a, b) =>
      `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
    )
    stringFeatures.sort((a, b) =>
      `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
    )
    floatVars.sort((a, b) => a.localeCompare(b))
    vectorVars.sort((a, b) => a.localeCompare(b))
    quatVars.sort((a, b) => a.localeCompare(b))
    transformVars.sort((a, b) => a.localeCompare(b))
    boolVars.sort((a, b) => a.localeCompare(b))
    intVars.sort((a, b) => a.localeCompare(b))
    wrappers.sort((a, b) => a.localeCompare(b))
    events.sort((a, b) => a.localeCompare(b))
    tags.sort((a, b) => a.localeCompare(b))
    entityTags.sort((a, b) => a.localeCompare(b))

    return {
      features,
      vectorFeatures,
      quatFeatures,
      boolFeatures,
      stringFeatures,
      floatVars,
      vectorVars,
      quatVars,
      transformVars,
      boolVars,
      intVars,
      wrappers,
      events,
      tags,
      entityTags,
    }
  })

  const clipStats = computed((): ClipLibraryStats => {
    void clipLibraryRevision.value
    return clipLibrary.value.stats()
  })

  const clipNames = computed((): string[] => {
    void clipLibraryRevision.value
    return clipLibrary.value.names()
  })

  const setupEntries = computed((): AnimSetupEntryView[] => {
    void clipLibraryRevision.value
    void wrapperWeightDrafts.value
    return clipLibrary.value.listEntries(isWrapperActive)
  })

  const animDbStats = computed((): AnimDatabaseStats => {
    void animDbRevision.value
    return animDbLibrary.value.stats()
  })

  const animDatabases = computed(() => {
    void animDbRevision.value
    return animDbLibrary.value.list()
  })

  const rigEntries = computed((): RigEntryView[] => {
    void rigRevision.value
    return rigLibrary.value.list()
  })

  const activeRigBones = computed((): string[] => {
    void rigRevision.value
    return rigLibrary.value.getActive()?.boneNames.slice() ?? []
  })

  const activeRigParts = computed((): string[] => {
    void rigRevision.value
    return rigLibrary.value.getActive()?.parts.map((p) => p.name) ?? []
  })

  const clipPoseSets = computed((): ClipPoseSetView[] => {
    void clipPoseRevision.value
    return clipPoseLibrary.value.listSets()
  })

  const getClipGlbInfo = (
    clipName: string,
    setupEntryId?: string | null
  ): { name: string; duration: number } | null => {
    void clipPoseRevision.value
    return clipPoseLibrary.value.getAnimInfo(clipName, setupEntryId)
  }

  const listGlbAnimNames = (setupEntryId: string): string[] => {
    void clipPoseRevision.value
    return clipPoseLibrary.value.listAnimNames(setupEntryId)
  }

  const featureKey = (feature: string, property: string) => `${feature}\0${property}`

  const applyDraftsToBoard = () => {
    for (const [key, val] of Object.entries(featureDrafts.value)) {
      const sep = key.indexOf('\0')
      if (sep < 0) continue
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.setFeature(key.slice(0, sep), key.slice(sep + 1), n)
    }
    for (const [key, val] of Object.entries(vectorFeatureDrafts.value)) {
      const sep = key.indexOf('\0')
      if (sep < 0 || !val) continue
      board.value.setVectorFeature(key.slice(0, sep), key.slice(sep + 1), val)
    }
    for (const [key, val] of Object.entries(quatFeatureDrafts.value)) {
      const sep = key.indexOf('\0')
      if (sep < 0 || !val) continue
      board.value.setQuatFeature(key.slice(0, sep), key.slice(sep + 1), val)
    }
    for (const [key, val] of Object.entries(boolFeatureDrafts.value)) {
      const sep = key.indexOf('\0')
      if (sep < 0) continue
      board.value.setBoolFeature(key.slice(0, sep), key.slice(sep + 1), val === true)
    }
    for (const [key, val] of Object.entries(stringFeatureDrafts.value)) {
      const sep = key.indexOf('\0')
      if (sep < 0) continue
      board.value.setStringFeature(key.slice(0, sep), key.slice(sep + 1), val ?? '')
    }
    for (const [name, val] of Object.entries(floatVarDrafts.value)) {
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.floatVars.set(name, n)
    }
    for (const [name, val] of Object.entries(vectorVarDrafts.value)) {
      if (!val) continue
      board.value.vectorVars.set(name, { ...val })
    }
    for (const [name, val] of Object.entries(quatVarDrafts.value)) {
      if (!val) continue
      board.value.quatVars.set(name, { ...val })
    }
    for (const [name, val] of Object.entries(boolVarDrafts.value)) {
      board.value.boolVars.set(name, val === true)
    }
    for (const [name, val] of Object.entries(intVarDrafts.value)) {
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.intVars.set(name, Math.round(n))
    }
    for (const [name, val] of Object.entries(tagValueDrafts.value)) {
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.setTagValue(name, n)
    }
    for (const [name, val] of Object.entries(wrapperWeightDrafts.value)) {
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.setWrapperWeight(name, n)
    }
    board.value.entityTags.clear()
    for (const [name, present] of Object.entries(entityTagDrafts.value)) {
      if (present) board.value.setEntityTag(name, true)
    }
  }

  /** Nested GraphSlot poses from last publish (survives until next publish). */
  let lastNestedPoseBySlot = new Map<string, Pose>()

  const makeSlotHost = (
    parentRunnerId: string,
    snapsByRunner: Record<string, SimSnapshot>,
    dt: number,
    nestedPoseBySlot: Map<string, Pose>,
    poseGen: number,
    rawDt = dt
  ): SimGraphSlotHost => ({
    stepNested(slotName, parentPoseUpdate, parentPoseSample) {
      const parentSimGraphRunner = runners.get(parentRunnerId)
      if (!parentSimGraphRunner) {
        console.warn(
          `[sim] stepNested: missing parent runner "${parentRunnerId}" (slot="${slotName}")`
        )
        return null
      }
      
      const parentSimGraphRunnerSlotDiagramId = parentSimGraphRunner.getSlotDiagramId(slotName)
      if (parentSimGraphRunner.isSlotInitialized(slotName) && !parentSimGraphRunnerSlotDiagramId) {
        // Uninitialized / explicit None → passthrough (do not step a child graph).
        return null
      }

      const childId = ensureSlotRunner(parentSimGraphRunner, slotName)
      if (!childId) return null
      if (nestStack.includes(childId)) return null
      const runner = runners.get(childId)
      if (!runner?.diagramId || !getRenderData(runner.diagramId)) return null
      // Share LookAt sample-context fields with parent (engine one AnimNodeSampleContext).
      runner.eyesLookAtEnabled = parentSimGraphRunner.eyesLookAtEnabled
      runner.entityLocalToWorld = parentSimGraphRunner.entityLocalToWorld
      runner.parentObjectLocalToWorld = parentSimGraphRunner.parentObjectLocalToWorld
      nestStack.push(childId)
      try {
        const snap = runner.step(
          dt,
          board.value,
          clock.value.time,
          clock.value.playing,
          clock.value.speed,
          {
            endBoardFrame: false,
            slotHost: makeSlotHost(
              childId,
              snapsByRunner,
              dt,
              nestedPoseBySlot,
              poseGen,
              rawDt
            ),
            parentPoseUpdate,
            parentPoseSample,
            poseGen,
            rawDt,
          }
        )
        parentSimGraphRunner.eyesLookAtEnabled = runner.eyesLookAtEnabled
        snapsByRunner[childId] = snap
        const pose = runner.getSampledPose()
        if (pose) {
          nestedPoseBySlot.set(slotName, pose)
          const lower = slotName.trim().toLowerCase()
          if (lower && lower !== slotName) nestedPoseBySlot.set(lower, pose)
        }
        return {
          diagramId: runner.diagramId,
          snap,
          inertialization: {
            isInertializationRequested:
              runner.inertializationRequest.isInertializationRequested,
            inertializationDuration:
              runner.inertializationRequest.inertializationDuration,
          },
          keepFullUpdate: runner.lastKeepFullUpdate,
        }
      } finally {
        nestStack.pop()
      }
    },
    getNestedPose(slotName) {
      const want = slotName.trim()
      if (!want || want === 'None') return null
      // Only poses written by stepNested this frame (never stale unbound sampleOut).
      return (
        nestedPoseBySlot.get(want) ??
        nestedPoseBySlot.get(want.toLowerCase()) ??
        null
      )
    },
  })

  const stepRunner = (
    runnerId: string,
    dt: number,
    slotHost: SimGraphSlotHost,
    endBoardFrame: boolean,
    poseGen: number,
    rawDt: number
  ): SimSnapshot => {
    const runner = runners.get(runnerId)
    if (!runner?.diagramId) {
      throw new Error(`[sim] stepRunner: missing bound runner "${runnerId}"`)
    }
    nestStack.push(runnerId)
    try {
      return runner.step(dt, board.value, clock.value.time, clock.value.playing, clock.value.speed, {
        endBoardFrame,
        slotHost,
        poseGen,
        rawDt,
      })
    } finally {
      nestStack.pop()
    }
  }

  const publish = (dt: number, rawDt = dt) => {
    if (!active.value) return

    applyDraftsToBoard()
    
    poseGenCounter += 1
    const poseGen = poseGenCounter

    const simGraphRunnerIdToSimSnapshot: Record<string, SimSnapshot> = {}

    lastNestedPoseBySlot = new Map()
    let root = runners.get(ROOT_RUNNER_ID)
    if (!root && !rootDetached) {
      const rootDiagram = resolveRootDiagramId(listDiagramIds.value)
      if (rootDiagram) root = setRunnerDiagramId(ROOT_RUNNER_ID, rootDiagram) ?? undefined
    }
    if (!root?.diagramId) {
      board.value.endFrame()
      snapshotsByRunner.value = simGraphRunnerIdToSimSnapshot
      return
    }

    const slotHost = makeSlotHost(
      ROOT_RUNNER_ID,
      simGraphRunnerIdToSimSnapshot,
      dt,
      lastNestedPoseBySlot,
      poseGen,
      rawDt
    )

    // Only root Update; slotted diagrams tick solely when GraphSlot is on the active path.
    if (getRenderData(root.diagramId)) {
      simGraphRunnerIdToSimSnapshot[ROOT_RUNNER_ID] = stepRunner(
        ROOT_RUNNER_ID,
        dt,
        slotHost,
        false,
        poseGen,
        rawDt
      )
    }

    board.value.endFrame()
    snapshotsByRunner.value = simGraphRunnerIdToSimSnapshot
  }

  const stopLoop = () => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    lastTs = 0
  }

  const loop = (ts: number) => {
    if (!active.value || !clock.value.playing) {
      raf = 0
      lastTs = 0
      return
    }
    raf = requestAnimationFrame(loop)
    if (!lastTs) lastTs = ts
    const wall = ts - lastTs
    lastTs = ts
    const dt = clock.value.tickWall(wall)
    if (dt > 0) publish(dt, clock.value.lastRawDt)
  }

  const syncLoop = () => {
    syncPlaying()
    const want = active.value && clock.value.playing
    enabled.value = want
    if (!want) {
      stopLoop()
      return
    }
    if (!raf) {
      lastTs = 0
      raf = requestAnimationFrame(loop)
    }
  }

  const rebind = () => {
    const ids = listDiagramIds.value
    const idSet = new Set(ids)
    // Snapshot topology before teardown (preserves rootDetached via serialize).
    const saved = serializeRunnerSlots()

    board.value.clearAll()
    applyRunnerSlotsConfig(saved)

    // Invalidate slot→diagram bindings whose diagrams left the project.
    for (const r of [...runners.values()]) {
      if (r.diagramId && !idSet.has(r.diagramId)) {
        destroyRunner(r.runnerId)
        continue
      }
      for (const [slot, diag] of [...r.slotDiagramIds.entries()]) {
        if (diag && !idSet.has(diag)) {
          r.setSlotDiagramId(slot, null)
          const childId = r.getSlotRunnerId(slot)
          if (childId) destroyRunner(childId)
          r.setSlotRunnerId(slot, null)
        }
      }
    }

    clock.value.reset()
    syncPlaying()
    // Drafts mirror board (incl. compile-time feature seeds).
    const drafts: Record<string, number> = {}
    for (const f of discovered.value.features) {
      drafts[featureKey(f.feature, f.property)] =
        board.value.getFeature(f.feature, f.property) ?? 0
    }
    featureDrafts.value = drafts
    const vecDrafts: Record<string, SimVec4> = {}
    for (const f of discovered.value.vectorFeatures) {
      vecDrafts[featureKey(f.feature, f.property)] =
        board.value.getVectorFeature(f.feature, f.property) ?? { ...ZERO_VEC4 }
    }
    vectorFeatureDrafts.value = vecDrafts
    const quatDrafts: Record<string, SimVec4> = {}
    for (const f of discovered.value.quatFeatures) {
      quatDrafts[featureKey(f.feature, f.property)] =
        board.value.getQuatFeature(f.feature, f.property) ?? {
          ...IDENTITY_QUAT_VEC4,
        }
    }
    quatFeatureDrafts.value = quatDrafts
    const boolDrafts: Record<string, boolean> = {}
    for (const f of discovered.value.boolFeatures) {
      boolDrafts[featureKey(f.feature, f.property)] =
        board.value.getBoolFeature(f.feature, f.property) ?? false
    }
    boolFeatureDrafts.value = boolDrafts
    const stringDrafts: Record<string, string> = {}
    for (const f of discovered.value.stringFeatures) {
      stringDrafts[featureKey(f.feature, f.property)] =
        board.value.getStringFeature(f.feature, f.property) ?? ''
    }
    stringFeatureDrafts.value = stringDrafts
    floatVarDrafts.value = {}
    vectorVarDrafts.value = {}
    quatVarDrafts.value = {}
    boolVarDrafts.value = {}
    intVarDrafts.value = {}
    tagValueDrafts.value = {}
    // entityTagDrafts are project resources — kept across rebind (like clip/anim DB).
    wrapperWeightDrafts.value = {}
    snapshotsByRunner.value = {}
    bumpRunners()
    publish(0)
    syncLoop()
  }

  // Project replace / diagram add-remove — full rebind. Soft diagram switch does not.
  watch(
    () => projectRef.value,
    () => {
      rebind()
    },
    { immediate: true }
  )

  const dispose = () => {
    stopLoop()
  }

  const play = () => {
    clock.value.play()
    syncPlaying()
    publish(0)
    syncLoop()
  }
  const pause = () => {
    clock.value.pause()
    syncPlaying()
    publish(0)
    syncLoop()
  }
  const toggle = () => {
    clock.value.toggle()
    syncPlaying()
    publish(0)
    syncLoop()
  }
  const step = () => {
    const dt = clock.value.step()
    publish(dt, clock.value.lastRawDt)
  }
  const reset = () => {
    clock.value.reset()
    syncPlaying()
    board.value.resetDynamics()
    for (const runner of runners.values()) runner.reset()
    publish(0)
    syncLoop()
  }

  const activate = () => {
    active.value = true
    publish(0)
    syncLoop()
  }
  const deactivate = () => {
    active.value = false
    clock.value.pause()
    syncPlaying()
    syncLoop()
  }
  const toggleActive = () => {
    if (active.value) deactivate()
    else activate()
  }

  const setSpeed = (s: number) => {
    clock.value.setSpeed(s)
    const nextSnaps: Record<string, SimSnapshot> = { ...snapshotsByRunner.value }
    for (const [id, snap] of Object.entries(nextSnaps)) {
      nextSnaps[id] = {
        ...snap,
        speed: clock.value.speed,
        nodeDelta: snap.nodeDelta ? { changes: {}, removed: [] } : null,
      }
    }
    snapshotsByRunner.value = nextSnaps
  }

  const fireExternal = (name?: string) => {
    const n = (name ?? eventDraft.value).trim()
    if (!n) return
    board.value.fireExternalEvent(n)
    publish(0)
  }

  const fireAnimEvent = (name?: string, value?: number) => {
    const n = (name ?? eventDraft.value).trim()
    if (!n) return
    board.value.injectAnimEventNow(
      n,
      value !== undefined && Number.isFinite(value) ? value : undefined
    )
    publish(0)
  }

  const fireAnimEnd = (name?: string) => {
    const n = (name ?? eventDraft.value).trim()
    board.value.fireAnimEnd(n || undefined)
    publish(0)
  }

  const setFloatVar = (name: string, value: number) => {
    const n = Number(value)
    if (!name || !Number.isFinite(n)) return
    floatVarDrafts.value = { ...floatVarDrafts.value, [name]: n }
    board.value.floatVars.set(name, n)
    publish(0)
  }

  const draftVectorVarValue = (name: string): SimVec4 => {
    if (!name) return { ...ZERO_VEC4 }
    const direct = vectorVarDrafts.value[name]
    if (direct) return { ...direct }
    const want = name.toLowerCase()
    for (const [k, v] of Object.entries(vectorVarDrafts.value)) {
      if (k.toLowerCase() === want) return { ...v }
    }
    return { ...ZERO_VEC4 }
  }

  const setVectorVar = (name: string, value: SimVec4) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const v: SimVec4 = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 0,
    }
    const next: Record<string, SimVec4> = { ...vectorVarDrafts.value }
    const want = trimmed.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k !== trimmed && k.toLowerCase() === want) delete next[k]
    }
    next[trimmed] = v
    vectorVarDrafts.value = next
    board.value.vectorVars.set(trimmed, v)
    publish(0)
  }

  const setVectorVarAxis = (name: string, axis: keyof SimVec4, value: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const cur = draftVectorVarValue(name)
    setVectorVar(name, { ...cur, [axis]: n })
  }

  const draftQuatVarValue = (name: string): SimVec4 => {
    if (!name) return { ...IDENTITY_QUAT_VEC4 }
    const direct = quatVarDrafts.value[name]
    if (direct) return { ...direct }
    const want = name.toLowerCase()
    for (const [k, v] of Object.entries(quatVarDrafts.value)) {
      if (k.toLowerCase() === want) return { ...v }
    }
    return { ...IDENTITY_QUAT_VEC4 }
  }

  const setQuatVar = (name: string, value: SimVec4) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const v: SimVec4 = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 1,
    }
    const next: Record<string, SimVec4> = { ...quatVarDrafts.value }
    const want = trimmed.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k !== trimmed && k.toLowerCase() === want) delete next[k]
    }
    next[trimmed] = v
    quatVarDrafts.value = next
    board.value.quatVars.set(trimmed, v)
    publish(0)
  }

  const setQuatVarAxis = (name: string, axis: keyof SimVec4, value: number) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const cur = draftQuatVarValue(name)
    setQuatVar(name, { ...cur, [axis]: n })
  }

  const setBoolVar = (name: string, value: boolean) => {
    const trimmed = name.trim()
    if (!trimmed) return
    boolVarDrafts.value = { ...boolVarDrafts.value, [trimmed]: value === true }
    board.value.boolVars.set(trimmed, value === true)
    publish(0)
  }

  const setIntVar = (name: string, value: number) => {
    const n = Number(value)
    if (!name || !Number.isFinite(n)) return
    const rounded = Math.round(n)
    intVarDrafts.value = { ...intVarDrafts.value, [name]: rounded }
    board.value.intVars.set(name, rounded)
    publish(0)
  }

  const setTagValue = (name: string, value: number) => {
    const n = Number(value)
    const trimmed = name.trim()
    if (!trimmed || !Number.isFinite(n)) return
    tagValueDrafts.value = { ...tagValueDrafts.value, [trimmed]: n }
    board.value.setTagValue(trimmed, n)
    publish(0)
  }

  const setWrapperWeight = (name: string, value: number) => {
    const n = Number(value)
    const trimmed = name.trim()
    if (!trimmed || !Number.isFinite(n)) return
    wrapperWeightDrafts.value = { ...wrapperWeightDrafts.value, [trimmed]: n }
    board.value.setWrapperWeight(trimmed, n)
    publish(0)
  }

  const invalidateAllStaticSwitches = () => {
    for (const r of runners.values()) r.invalidateStaticSwitches()
  }

  const setEntityTag = (name: string, present: boolean) => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === 'None') return
    entityTagDrafts.value = { ...entityTagDrafts.value, [trimmed]: present === true }
    board.value.setEntityTag(trimmed, present === true)
    invalidateAllStaticSwitches()
    publish(0)
  }

  const removeEntityTag = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const next = { ...entityTagDrafts.value }
    delete next[trimmed]
    entityTagDrafts.value = next
    board.value.setEntityTag(trimmed, false)
    invalidateAllStaticSwitches()
    publish(0)
  }

  /** Nested withBatch depth — publish only when outermost batch ends. */
  let featureBatchDepth = 0

  const withFeatureBatch = (fn: () => void) => {
    featureBatchDepth++
    try {
      fn()
    } finally {
      featureBatchDepth--
      if (featureBatchDepth === 0) publish(0)
    }
  }

  const publishFeatureUnlessBatch = () => {
    if (featureBatchDepth === 0) publish(0)
  }

  const setFeature = (feature: string, property: string, value: number) => {
    const n = Number(value)
    if (!feature || !property || !Number.isFinite(n)) return
    const key = featureKey(feature, property)
    const next: Record<string, number> = { ...featureDrafts.value }
    const want = `${feature}.${property}`.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k === key) continue
      if (k.includes('\0')) {
        const sep = k.indexOf('\0')
        const label = `${k.slice(0, sep)}.${k.slice(sep + 1)}`.toLowerCase()
        if (label === want) delete next[k]
      } else if (k.toLowerCase() === want) {
        delete next[k]
      }
    }
    next[key] = n
    featureDrafts.value = next
    board.value.setFeature(feature, property, n)
    publishFeatureUnlessBatch()
  }

  const draftFeatureValue = (feature: string, property: string) => {
    const key = featureKey(feature, property)
    if (key in featureDrafts.value) return featureDrafts.value[key] ?? 0
    const want = `${feature}.${property}`.toLowerCase()
    for (const [k, v] of Object.entries(featureDrafts.value)) {
      if (k.toLowerCase() === want) return v
    }
    return 0
  }

  const draftVectorFeatureValue = (feature: string, property: string): SimVec4 => {
    const key = featureKey(feature, property)
    const direct = vectorFeatureDrafts.value[key]
    if (direct) return { ...direct }
    const want = `${feature}.${property}`.toLowerCase()
    for (const [k, v] of Object.entries(vectorFeatureDrafts.value)) {
      if (k.toLowerCase() === want) return { ...v }
    }
    return { ...ZERO_VEC4 }
  }

  const draftBoolFeatureValue = (feature: string, property: string): boolean => {
    const key = featureKey(feature, property)
    if (key in boolFeatureDrafts.value) return boolFeatureDrafts.value[key] === true
    const want = `${feature}.${property}`.toLowerCase()
    for (const [k, v] of Object.entries(boolFeatureDrafts.value)) {
      if (k.toLowerCase() === want) return v === true
    }
    return false
  }

  const setBoolFeature = (feature: string, property: string, value: boolean) => {
    if (!feature || !property) return
    const key = featureKey(feature, property)
    const next: Record<string, boolean> = { ...boolFeatureDrafts.value }
    const want = `${feature}.${property}`.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k === key) continue
      if (k.includes('\0')) {
        const sep = k.indexOf('\0')
        const label = `${k.slice(0, sep)}.${k.slice(sep + 1)}`.toLowerCase()
        if (label === want) delete next[k]
      } else if (k.toLowerCase() === want) {
        delete next[k]
      }
    }
    next[key] = value === true
    boolFeatureDrafts.value = next
    board.value.setBoolFeature(feature, property, value === true)
    publishFeatureUnlessBatch()
  }

  const draftStringFeatureValue = (feature: string, property: string): string => {
    const key = featureKey(feature, property)
    if (key in stringFeatureDrafts.value) return stringFeatureDrafts.value[key] ?? ''
    const want = `${feature}.${property}`.toLowerCase()
    for (const [k, v] of Object.entries(stringFeatureDrafts.value)) {
      if (k.toLowerCase() === want) return v
    }
    return ''
  }

  const setStringFeature = (feature: string, property: string, value: string) => {
    if (!feature || !property) return
    const key = featureKey(feature, property)
    const next: Record<string, string> = { ...stringFeatureDrafts.value }
    const want = `${feature}.${property}`.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k === key) continue
      if (k.includes('\0')) {
        const sep = k.indexOf('\0')
        const label = `${k.slice(0, sep)}.${k.slice(sep + 1)}`.toLowerCase()
        if (label === want) delete next[k]
      } else if (k.toLowerCase() === want) {
        delete next[k]
      }
    }
    next[key] = value ?? ''
    stringFeatureDrafts.value = next
    board.value.setStringFeature(feature, property, value ?? '')
    publishFeatureUnlessBatch()
  }

  const getFeature = (feature: string, property: string): number | undefined => {
    const key = featureKey(feature, property)
    if (key in featureDrafts.value) {
      const n = Number(featureDrafts.value[key])
      return Number.isFinite(n) ? n : undefined
    }
    return board.value.getFeature(feature, property)
  }

  const getBoolFeature = (feature: string, property: string): boolean | undefined => {
    const key = featureKey(feature, property)
    if (key in boolFeatureDrafts.value) return boolFeatureDrafts.value[key] === true
    return board.value.getBoolFeature(feature, property)
  }

  const getStringFeature = (feature: string, property: string): string | undefined => {
    const key = featureKey(feature, property)
    if (key in stringFeatureDrafts.value) return stringFeatureDrafts.value[key]
    return board.value.getStringFeature(feature, property)
  }

  const getVectorFeature = (feature: string, property: string): SimVec4 | undefined => {
    const key = featureKey(feature, property)
    const direct = vectorFeatureDrafts.value[key]
    if (direct) return { ...direct }
    return board.value.getVectorFeature(feature, property)
  }

  const getQuatFeature = (feature: string, property: string): SimVec4 | undefined => {
    const key = featureKey(feature, property)
    const direct = quatFeatureDrafts.value[key]
    if (direct) return { ...direct }
    return board.value.getQuatFeature(feature, property)
  }

  const setVectorFeature = (feature: string, property: string, value: SimVec4) => {
    if (!feature || !property) return
    const key = featureKey(feature, property)
    const next: Record<string, SimVec4> = { ...vectorFeatureDrafts.value }
    const want = `${feature}.${property}`.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k === key) continue
      if (k.includes('\0')) {
        const sep = k.indexOf('\0')
        const label = `${k.slice(0, sep)}.${k.slice(sep + 1)}`.toLowerCase()
        if (label === want) delete next[k]
      } else if (k.toLowerCase() === want) {
        delete next[k]
      }
    }
    const v: SimVec4 = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 0,
    }
    next[key] = v
    vectorFeatureDrafts.value = next
    board.value.setVectorFeature(feature, property, v)
    publishFeatureUnlessBatch()
  }

  const setVectorFeatureAxis = (
    feature: string,
    property: string,
    axis: keyof SimVec4,
    value: number
  ) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const cur = draftVectorFeatureValue(feature, property)
    setVectorFeature(feature, property, { ...cur, [axis]: n })
  }

  const draftQuatFeatureValue = (feature: string, property: string): SimVec4 => {
    const key = featureKey(feature, property)
    const direct = quatFeatureDrafts.value[key]
    if (direct) return { ...direct }
    const want = `${feature}.${property}`.toLowerCase()
    for (const [k, v] of Object.entries(quatFeatureDrafts.value)) {
      if (k.toLowerCase() === want) return { ...v }
    }
    return { ...IDENTITY_QUAT_VEC4 }
  }

  const setQuatFeature = (feature: string, property: string, value: SimVec4) => {
    if (!feature || !property) return
    const key = featureKey(feature, property)
    const next: Record<string, SimVec4> = { ...quatFeatureDrafts.value }
    const want = `${feature}.${property}`.toLowerCase()
    for (const k of Object.keys(next)) {
      if (k === key) continue
      if (k.includes('\0')) {
        const sep = k.indexOf('\0')
        const label = `${k.slice(0, sep)}.${k.slice(sep + 1)}`.toLowerCase()
        if (label === want) delete next[k]
      } else if (k.toLowerCase() === want) {
        delete next[k]
      }
    }
    const v: SimVec4 = {
      x: Number.isFinite(value.x) ? value.x : 0,
      y: Number.isFinite(value.y) ? value.y : 0,
      z: Number.isFinite(value.z) ? value.z : 0,
      w: Number.isFinite(value.w) ? value.w : 1,
    }
    next[key] = v
    quatFeatureDrafts.value = next
    board.value.setQuatFeature(feature, property, v)
    publishFeatureUnlessBatch()
  }

  const setQuatFeatureAxis = (
    feature: string,
    property: string,
    axis: keyof SimVec4,
    value: number
  ) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return
    const cur = draftQuatFeatureValue(feature, property)
    setQuatFeature(feature, property, { ...cur, [axis]: n })
  }

  const loadAnimsetJson = (
    json: unknown,
    sourceLabel?: string,
    options?: { priority?: number; variableNames?: string[] }
  ): number => {
    const n = loadAnimsJsonIntoLibrary(clipLibrary.value, json, sourceLabel, {
      priority: options?.priority ?? DEFAULT_ANIM_SETUP_PRIORITY,
      variableNames: options?.variableNames,
    })
    bumpClips()
    if (options?.variableNames?.length) {
      const next = { ...wrapperWeightDrafts.value }
      for (const name of options.variableNames) {
        const t = name.trim()
        if (t && !(t in next)) next[t] = 0
      }
      wrapperWeightDrafts.value = next
    }
    publish(0)
    return n
  }

  const loadClipLibraryJson = (json: unknown, sourceLabel?: string): number => {
    const n = loadCompactClipLibraryJson(clipLibrary.value, json, sourceLabel)
    bumpClips()
    publish(0)
    return n
  }

  const clearClipLibrary = () => {
    clipLibrary.value.clear()
    clipPoseLibrary.value.clear()
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const loadAnimsetGlb = async (
    buffer: ArrayBuffer,
    sourceLabel: string,
    setupEntryId?: string | null
  ): Promise<number> => {
    if (!setupEntryId) {
      console.warn('loadAnimsetGlb requires setupEntryId')
      return 0
    }
    const typesFromJson = clipLibrary.value.getAnimationTypesForEntry(setupEntryId)
    const { animCount } = clipPoseLibrary.value.loadGlb(
      buffer,
      sourceLabel,
      setupEntryId,
      typesFromJson
    )
    bumpClipPose()
    syncSampleResourcesToRunners()
    publish(0)
    return animCount
  }

  const clearAnimsetGlb = (setupEntryId: string) => {
    if (!clipPoseLibrary.value.removeBySetupEntry(setupEntryId)) return
    bumpClipPose()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const clearClipPoseLibrary = () => {
    clipPoseLibrary.value.clear()
    bumpClipPose()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const loadRigJson = (json: unknown, sourceLabel?: string): string => {
    const id = rigLibrary.value.addFromJson(json, sourceLabel || 'rig')
    bumpRigs()
    syncSampleResourcesToRunners()
    publish(0)
    return id
  }

  const removeRig = (id: string) => {
    if (!rigLibrary.value.remove(id)) return
    bumpRigs()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const setActiveRig = (id: string | null) => {
    if (!rigLibrary.value.setActive(id)) return
    bumpRigs()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const clearRigLibrary = () => {
    rigLibrary.value.clear()
    bumpRigs()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const setStackCaptureHandleIds = (ids: string[]) => {
    const cleaned = ids.map((id) => id.trim()).filter(Boolean)
    stackCaptureHandleIds.value = cleaned
    for (const runner of runners.values()) {
      // Only capture on diagrams that own the handle (avoid ranged looking for player_base ids).
      runner.setStackCaptureHandleIds(cleaned.filter((id) => runner.hasHandle(id)))
    }
    publish(0)
  }

  const setSampleWarningsEnabled = (on: boolean) => {
    sampleWarningsEnabled.value = on
    for (const runner of runners.values()) {
      runner.sampleWarningsEnabled = on
    }
    publish(0)
  }

  const setUpdateWarningsEnabled = (on: boolean) => {
    updateWarningsEnabled.value = on
    for (const runner of runners.values()) {
      runner.updateWarningsEnabled = on
    }
    publish(0)
  }

  const resolveRunnerPose = (
    runnerId: string,
    poseRef: DerivedPoseRef
  ): { pose: Pose | null; rig: RigEntry | null } => {
    const runner = runners.get(runnerId)
    if (!runner) return { pose: null, rig: null }
    const rig = runner.getActiveRig()
    if (poseRef === 'sample') {
      return { pose: runner.getSampledPose(), rig }
    }
    return {
      pose: runner.getCapturedPose(poseRef.capture) ?? runner.getSampledPose(),
      rig,
    }
  }

  /**
   * Pose-derived HUD stats (stack / tracks / rig bones).
   * Pass the runner snapshot so `poseGen` drives cache + Vue ticks.
   * Pose is resolved once per cache key; builders only read that pose.
   */
  const getDerivedPoseStats = (
    snap: SimSnapshot,
    runnerId: string,
    opts: {
      pose?: DerivedPoseRef
      need: DerivedPoseStatsNeed
    }
  ): Readonly<DerivedPoseStats> => {
    const poseRef = opts.pose ?? 'sample'
    const poseGen = snap.poseGen
    if (derivedPoseCacheGen !== poseGen) {
      derivedPoseCache.clear()
      derivedPoseCacheGen = poseGen
    }
    const key = `${poseGen}|${runnerId}|${poseRefKey(poseRef)}`
    let entry = derivedPoseCache.get(key)
    if (!entry) {
      entry = {}
      derivedPoseCache.set(key, entry)
    }

    const need = opts.need
    const wantsAny =
      need.stackNames === true ||
      need.stackBones === true ||
      need.trackStack === true ||
      need.rigBones === true
    if (!wantsAny) return entry

    if (!entry.resolved) {
      const resolved = resolveRunnerPose(runnerId, poseRef)
      entry.pose = resolved.pose
      entry.rig = resolved.rig
      entry.resolved = true
    }

    const pose = entry.pose
    if (!pose) return entry

    if (need.stackNames && entry.stackNames === undefined) {
      entry.stackNames = buildStackNamesStats(pose)
    }
    if (need.stackBones && entry.stackBones === undefined) {
      entry.stackBones = buildStackBonesStats(pose)
    }
    if (need.trackStack && entry.trackStack === undefined) {
      entry.trackStack = buildTrackStackStats(pose)
    }
    if (need.rigBones && entry.rigBones === undefined) {
      entry.rigBones = entry.rig ? buildRigBonesStats(pose, entry.rig) : undefined
    }

    return entry
  }

  const loadAnimDatabaseJson = (json: object, sourceLabel?: string): string => {
    const db = loadAnimDatabaseCsvJson(animDbLibrary.value, json, sourceLabel)
    if (!db.rows.length) {
      animDbLibrary.value.remove(db.pathKey)
      bumpAnimDb()
      return ''
    }
    bumpAnimDb()
    publish(0)
    return db.pathKey
  }

  const loadAnimDatabaseLibraryJson = (json: object, sourceLabel?: string): number => {
    const n = loadCompactAnimDatabaseLibraryJson(animDbLibrary.value, json, sourceLabel)
    bumpAnimDb()
    publish(0)
    return n
  }

  const clearAnimDatabaseLibrary = () => {
    animDbLibrary.value.clear()
    bumpAnimDb()
    publish(0)
  }

  const removeAnimDatabase = (pathKey: string) => {
    if (!animDbLibrary.value.remove(pathKey)) return
    bumpAnimDb()
    publish(0)
  }

  const updateSetupEntry = (
    id: string,
    patch: { priority?: number; variableNames?: string[]; tags?: string[] }
  ) => {
    if (!clipLibrary.value.updateEntry(id, patch)) return
    if (patch.variableNames) {
      const next = { ...wrapperWeightDrafts.value }
      for (const name of patch.variableNames) {
        if (name && !(name in next)) next[name] = 0
      }
      wrapperWeightDrafts.value = next
    }
    bumpClips()
    publish(0)
  }

  const removeSetupEntry = (id: string) => {
    clipPoseLibrary.value.removeBySetupEntry(id)
    if (!clipLibrary.value.removeEntry(id)) return
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    publish(0)
  }

  const getClip = (name: string): ClipMeta | undefined => {
    void clipLibraryRevision.value
    void wrapperWeightDrafts.value
    return clipLibrary.value.resolveClip(name, isWrapperActive)
  }

  const lookupClip = (name: string): ClipMeta | undefined => {
    void clipLibraryRevision.value
    return clipLibrary.value.lookup(name)
  }

  const getClipInEntry = (name: string, entryId: string): ClipMeta | undefined => {
    void clipLibraryRevision.value
    return clipLibrary.value.getClipInEntry(name, entryId)
  }

  const isClipActive = (name: string): boolean => getClip(name) !== undefined

  const listClipSets = (name: string): ClipSetMembership[] => {
    void clipLibraryRevision.value
    void wrapperWeightDrafts.value
    return clipLibrary.value.entriesContainingClip(name, isWrapperActive)
  }

  const exportCompactClipLibrary = () => clipLibraryToCompactJson(clipLibrary.value)

  const exportCompactAnimDatabaseLibrary = () =>
    animDatabaseLibraryToCompactJson(animDbLibrary.value)

  // function decls so rebind()'s immediate project watch can call them (hoisted).
  // Pair: rewriteRunnerSlotsDiagramIds (module export) rewrites this JSON shape.
  function serializeRunnerSlots(): SimRunnerSlotsConfigJson | undefined {
    if (rootDetached) {
      return {
        rootRunnerId: ROOT_RUNNER_ID,
        rootDetached,
        runners: {},
      }
    }

    const rootRunner = runners.get(ROOT_RUNNER_ID)
    if (!rootRunner || !rootRunner.diagramId) {
      return undefined
    }

    const onlyRootDefault =
      runners.size <= 1 &&
      rootRunner.slotInitialized.size === 0 &&
      rootRunner.slotDiagramIds.size === 0 &&
      rootRunner.slotRunnerIds.size === 0 &&
      rootRunner.diagramId === resolveRootDiagramId(listDiagramIds.value)
    if (onlyRootDefault) return undefined

    // Map holds only live bound runners — no reachability walk needed.
    const runnersJson: SimRunnerSlotsConfigJson['runners'] = {}
    for (const [runnerId, runner] of runners) {
      if (!runner.diagramId) continue
      
      runnersJson[runnerId] = {
        diagramId: runner.diagramId,
        slotInitialized: [...runner.slotInitialized],
        slotDiagramIds: Object.fromEntries(runner.slotDiagramIds),
        slotRunnerIds: Object.fromEntries(runner.slotRunnerIds),
      }
    }
    return { rootRunnerId: ROOT_RUNNER_ID, runners: runnersJson }
  }

  function applyRunnerSlotsConfig(cfg: SimRunnerSlotsConfigJson | null | undefined) {
    for (const id of [...runners.keys()]) destroyRunner(id)
    nextSlotRunnerSeq = 1
    rootDetached = false
    const ids = listDiagramIds.value
    const idSet = new Set(ids)

    if (cfg?.rootDetached === true) {
      rootDetached = true
      bumpRunners()
      return
    }

    // Legacy: empty diagramId on root entry → rootDetached.
    const legacyRootEntry =
      cfg?.runners && typeof cfg.runners === 'object'
        ? cfg.runners[ROOT_RUNNER_ID] ??
          (typeof cfg.rootRunnerId === 'string'
            ? cfg.runners[cfg.rootRunnerId.trim()]
            : undefined)
        : undefined
    if (
      legacyRootEntry &&
      typeof legacyRootEntry.diagramId === 'string' &&
      !legacyRootEntry.diagramId.trim()
    ) {
      rootDetached = true
      bumpRunners()
      return
    }

    if (!cfg?.runners || typeof cfg.runners !== 'object') {
      const rootDiag = resolveRootDiagramId(ids)
      if (rootDiag) setRunnerDiagramId(ROOT_RUNNER_ID, rootDiag)
      bumpRunners()
      return
    }

    const rootEntry =
      cfg.runners[ROOT_RUNNER_ID] ??
      (typeof cfg.rootRunnerId === 'string' && cfg.runners[cfg.rootRunnerId.trim()]
        ? cfg.runners[cfg.rootRunnerId.trim()]
        : undefined)

    const rootDiagRaw =
      typeof rootEntry?.diagramId === 'string' ? rootEntry.diagramId.trim() : ''
    const rootDiag =
      rootDiagRaw && idSet.has(rootDiagRaw)
        ? rootDiagRaw
        : resolveRootDiagramId(ids) ?? ''
    if (!rootDiag) {
      rootDetached = true
      bumpRunners()
      return
    }

    setRunnerDiagramId(ROOT_RUNNER_ID, rootDiag, { skipMaterialize: true })
    const root = runners.get(ROOT_RUNNER_ID)
    if (!root) {
      bumpRunners()
      return
    }

    // Apply slot topology onto bound runners (BFS by saved entries).
    const applySlotsToRunner = (
      runnerId: string,
      entry: NonNullable<SimRunnerSlotsConfigJson['runners']>[string]
    ) => {
      const r = runners.get(runnerId)
      if (!r || !entry) return
      if (entry.slotDiagramIds && typeof entry.slotDiagramIds === 'object') {
        for (const [slot, diag] of Object.entries(entry.slotDiagramIds)) {
          const s = slot.trim()
          if (!s) continue
          const d = typeof diag === 'string' ? diag.trim() : ''
          if (!d || !idSet.has(d)) continue
          r.setSlotDiagramId(s, d)
        }
      }
      if (Array.isArray(entry.slotInitialized)) {
        for (const slot of entry.slotInitialized) {
          const s = typeof slot === 'string' ? slot.trim() : ''
          if (!s) continue
          if (!r.isSlotInitialized(s)) r.setSlotDiagramId(s, null)
        }
      }
      if (entry.slotRunnerIds && typeof entry.slotRunnerIds === 'object') {
        for (const [slot, childId] of Object.entries(entry.slotRunnerIds)) {
          const s = slot.trim()
          const c = typeof childId === 'string' ? childId.trim() : ''
          if (!s || !c) continue
          const childEntry = cfg!.runners![c]
          const childDiag =
            typeof childEntry?.diagramId === 'string' ? childEntry.diagramId.trim() : ''
          if (!childDiag || !idSet.has(childDiag)) continue
          r.setSlotRunnerId(s, c)
          const m = /^s(\d+)$/.exec(c)
          if (m) {
            const n = Number(m[1])
            if (Number.isFinite(n) && n >= nextSlotRunnerSeq) nextSlotRunnerSeq = n + 1
          }
          setRunnerDiagramId(c, childDiag, { skipMaterialize: true })
          if (childEntry) applySlotsToRunner(c, childEntry)
        }
      }
    }

    if (rootEntry) applySlotsToRunner(ROOT_RUNNER_ID, rootEntry)
    materializeSlotTree(ROOT_RUNNER_ID)
    bumpRunners()
  }

  /** Project IO: omit empty libraries so old/small projects stay lean. */
  const getProjectSimResources = (opts?: { includeClipPoses?: boolean }) => {
    const includeClipPoses = opts?.includeClipPoses === true
    const clipSetup =
      clipLibrary.value.entryCount > 0 ? clipLibraryToCompactJson(clipLibrary.value) : undefined
    const animDatabaseLibrary =
      animDbLibrary.value.size > 0
        ? animDatabaseLibraryToCompactJson(animDbLibrary.value)
        : undefined
    const entityTags =
      Object.keys(entityTagDrafts.value).length > 0
        ? { ...entityTagDrafts.value }
        : undefined
    const rigLibraryJson =
      rigLibrary.value.size > 0 ? rigLibrary.value.toJson() : undefined
    const clipPoseLibraryJson = includeClipPoses
      ? getCachedClipPoseLibraryJson()
      : undefined
    const hasPoses = clipPoseLibrary.value.size > 0
    const runnerSlots = serializeRunnerSlots()
    if (
      clipSetup == null &&
      animDatabaseLibrary == null &&
      entityTags == null &&
      (rigLibraryJson == null || !(rigLibraryJson.entries?.length > 0)) &&
      !hasPoses &&
      runnerSlots == null
    ) {
      return null
    }
    return {
      clipSetup,
      animDatabaseLibrary,
      entityTags,
      rigLibrary: rigLibraryJson,
      clipPoseLibrary: clipPoseLibraryJson,
      clipPoseRevision: clipPoseRevision.value,
      runnerSlots,
    }
  }

  const applyProjectSimResources = (
    resources: {
      clipSetup?: AnimClipSetupJson
      animDatabaseLibrary?: AnimDatabaseLibraryJson
      entityTags?: Record<string, boolean>
      rigLibrary?: RigLibraryJson
      clipPoseLibrary?: ClipPoseLibraryJson
      runnerSlots?: SimRunnerSlotsConfigJson
    } | null
  ) => {
    clipLibrary.value.clear()
    animDbLibrary.value.clear()
    clipPoseLibrary.value.clear()
    rigLibrary.value.clear()
    entityTagDrafts.value = {}
    if (resources?.clipSetup != null) {
      try {
        loadCompactClipLibraryJson(clipLibrary.value, resources.clipSetup, 'project')
      } catch (err) {
        console.warn('Failed to restore project clipSetup', err)
      }
    }
    if (resources?.animDatabaseLibrary != null) {
      try {
        loadCompactAnimDatabaseLibraryJson(
          animDbLibrary.value,
          resources.animDatabaseLibrary,
          'project'
        )
      } catch (err) {
        console.warn('Failed to restore project animDatabaseLibrary', err)
      }
    }
    if (resources?.entityTags != null && typeof resources.entityTags === 'object') {
      const next: Record<string, boolean> = {}
      for (const [name, present] of Object.entries(resources.entityTags)) {
        const trimmed = name.trim()
        if (!trimmed || trimmed === 'None') continue
        next[trimmed] = present === true
      }
      entityTagDrafts.value = next
    }
    if (resources?.rigLibrary != null) {
      try {
        rigLibrary.value.loadFromJson(resources.rigLibrary)
      } catch (err) {
        console.warn('Failed to restore project rigLibrary', err)
      }
    }
    if (resources?.clipPoseLibrary != null) {
      try {
        clipPoseLibrary.value.loadFromJson(resources.clipPoseLibrary)
      } catch (err) {
        console.warn('Failed to restore project clipPoseLibrary', err)
      }
    }
    applyRunnerSlotsConfig(resources?.runnerSlots)
    bumpClips()
    bumpAnimDb()
    bumpRigs()
    bumpClipPose()
    // Rebind reachable runners to restored topology + libraries.
    rebind()
  }

  /** Overlay helper: one runner for a diagram (root preferred). Prefer `snapshotForRunner`. */
  const snapshotForDiagram = (diagramId: string | null | undefined): SimSnapshot | undefined => {
    if (!diagramId) return undefined
    const runner = findRunnerByDiagramId(diagramId)
    if (!runner) return undefined
    return snapshotsByRunner.value[runner.runnerId]
  }

  const snapshotForRunner = (runnerId: string | null | undefined): SimSnapshot | undefined => {
    if (!runnerId) return undefined
    return snapshotsByRunner.value[runnerId]
  }

  /**
   * Pooled pose + rig for skeleton viewport (not reactive — call each frame).
   * - full: root runner sampleOut
   * - selected: chosen runner sampleOut (`selectedRunnerId`)
   * - atNode: Sample capture at selected handle (fallback → open/selected/full)
   */
  const getSkeletonViewPose = (
    source: 'full' | 'selected' | 'atNode',
    options?: {
      /** Prefer open diagram for atNode capture search / fallback. */
      activeDiagramId?: string | null
      /** Runner Sample out when source is `selected`. */
      selectedRunnerId?: string | null
      /** @deprecated use selectedRunnerId */
      selectedDiagramId?: string | null
      captureHandleId?: string | null
    }
  ): { pose: Pose; rig: RigEntry } | null => {
    const pickRunner = (runnerId: string | null | undefined) => {
      if (!runnerId) return null
      const runner = runners.get(runnerId)
      if (!runner) return null
      const rig = runner.getActiveRig() ?? rigLibrary.value.getActive()
      const pose = runner.getSampledPose()
      if (!rig || !pose) return null
      return { pose, rig }
    }
    const pickByDiagram = (diagramId: string | null | undefined) => {
      if (!diagramId) return null
      const runner = findRunnerByDiagramId(diagramId)
      return runner ? pickRunner(runner.runnerId) : null
    }

    const rootId = ROOT_RUNNER_ID
    const openDiagramId =
      options?.activeDiagramId ?? activeDiagramId.value ?? runners.get(rootId)?.diagramId
    const selectedRunnerId =
      options?.selectedRunnerId ||
      (options?.selectedDiagramId
        ? findRunnerByDiagramId(options.selectedDiagramId)?.runnerId
        : null) ||
      rootId

    if (source === 'full') return pickRunner(rootId)

    if (source === 'selected') return pickRunner(selectedRunnerId)

    // atNode — prefer explicit runner (filtered to node’s diagram in UI).
    const atRunnerId = options?.selectedRunnerId?.trim() || null
    const hid = options?.captureHandleId?.trim()
    if (hid) {
      const tryCaptureOnRunner = (runner: SimGraphRunner | null | undefined) => {
        if (!runner) return null
        const pose = runner.getCapturedPose(hid)
        const rig = runner.getActiveRig() ?? rigLibrary.value.getActive()
        if (!pose || !rig) return null
        return { pose, rig }
      }
      if (atRunnerId) {
        const hit = tryCaptureOnRunner(runners.get(atRunnerId))
        if (hit) {
          if (isSimSampleLogEnabled()) {
            console.log(
              `[sim-sample] viewport atNode=${hid} source=capture runner=${atRunnerId}`
            )
          }
          return hit
        }
      }
      const fromOpen = tryCaptureOnRunner(
        openDiagramId ? findRunnerByDiagramId(openDiagramId) : runners.get(rootId)
      )
      if (fromOpen) {
        if (isSimSampleLogEnabled()) {
          console.log(`[sim-sample] viewport atNode=${hid} source=capture diagram=${openDiagramId}`)
        }
        return fromOpen
      }
      for (const runner of runners.values()) {
        const hit = tryCaptureOnRunner(runner)
        if (hit) {
          if (isSimSampleLogEnabled()) {
            console.log(
              `[sim-sample] viewport atNode=${hid} source=capture diagram=${runner.diagramId} runner=${runner.runnerId}`
            )
          }
          return hit
        }
      }
      if (isSimSampleLogEnabled()) {
        console.log(
          `[sim-sample] viewport atNode=${hid} source=FALLBACK-sampleOut open=${openDiagramId} root=${rootId}`
        )
      }
    }
    return (
      pickRunner(atRunnerId) ?? pickByDiagram(openDiagramId) ?? pickRunner(rootId)
    )
  }

  return {
    enabled,
    active,
    playing,
    getPrimaryRunner,
    getRunner,
    getRootRunnerId,
    ensureRunner,
    ensureSlotRunner: (parentId: string, slotName: string) => {
      const parent = runners.get(parentId)
      if (!parent) return null
      return ensureSlotRunner(parent, slotName)
    },
    listSlotRunners,
    listBoundRunnerTree,
    listBoundRunnerTreeForDiagram,
    listBoundRunnerPaths,
    setSlotDiagramId,
    getSlotDiagramId,
    getSlotRunnerId,
    setRunnerDiagramId,
    findRunnerByDiagramId,
    findRunnersByDiagramId,
    withFeatureBatch,
    getFeature,
    getBoolFeature,
    getStringFeature,
    getVectorFeature,
    getQuatFeature,
    snapshot,
    snapshotsByRunner,
    runnersRev,
    snapshotForDiagram,
    snapshotForRunner,
    getSkeletonViewPose,
    discovered,
    eventDraft,
    eventValueDraft,
    featureDrafts,
    vectorFeatureDrafts,
    quatFeatureDrafts,
    boolFeatureDrafts,
    stringFeatureDrafts,
    floatVarDrafts,
    vectorVarDrafts,
    quatVarDrafts,
    boolVarDrafts,
    intVarDrafts,
    tagValueDrafts,
    entityTagDrafts,
    wrapperWeightDrafts,
    clipStats,
    clipNames,
    setupEntries,
    animDbStats,
    animDatabases,
    rigEntries,
    activeRigBones,
    activeRigParts,
    clipPoseSets,
    getClipGlbInfo,
    listGlbAnimNames,
    draftFeatureValue,
    draftVectorFeatureValue,
    draftQuatFeatureValue,
    draftBoolFeatureValue,
    draftStringFeatureValue,
    getClip,
    lookupClip,
    getClipInEntry,
    isClipActive,
    listClipSets,
    loadAnimsetJson,
    loadAnimsetGlb,
    clearAnimsetGlb,
    loadClipLibraryJson,
    clearClipLibrary,
    clearClipPoseLibrary,
    loadRigJson,
    removeRig,
    setActiveRig,
    clearRigLibrary,
    stackCaptureHandleIds,
    getDerivedPoseStats,
    sampleWarningsEnabled,
    setSampleWarningsEnabled,
    updateWarningsEnabled,
    setUpdateWarningsEnabled,
    setStackCaptureHandleIds,
    loadAnimDatabaseJson,
    loadAnimDatabaseLibraryJson,
    clearAnimDatabaseLibrary,
    removeAnimDatabase,
    updateSetupEntry,
    removeSetupEntry,
    exportCompactClipLibrary,
    exportCompactAnimDatabaseLibrary,
    getProjectSimResources,
    getCachedClipPoseCompactText,
    applyProjectSimResources,
    play,
    pause,
    toggle,
    step,
    reset,
    activate,
    deactivate,
    toggleActive,
    setSpeed,
    fireExternal,
    fireAnimEvent,
    fireAnimEnd,
    setFloatVar,
    setVectorVar,
    setVectorVarAxis,
    draftVectorVarValue,
    setQuatVar,
    setQuatVarAxis,
    draftQuatVarValue,
    setBoolVar,
    setIntVar,
    setTagValue,
    setEntityTag,
    removeEntityTag,
    setWrapperWeight,
    setFeature,
    setBoolFeature,
    setStringFeature,
    setVectorFeature,
    setVectorFeatureAxis,
    setQuatFeature,
    setQuatFeatureAxis,
    rebind,
    dispose,
  }
}

