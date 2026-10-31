import { SequentialIdAllocator } from '@/utils/SequentialIdAllocator'
import { mergeSets, mergeUniqueStrings } from '@/utils/merge'
import { SimGraphSampleSlotHost, SimGraphUpdateSlotHost } from '@/utils/sim/SimGraphRunner.types'
import { DiscoveredGraphInputs, discoverGraphInputs } from '@/utils/sim/discoverGraphInputs'
import { computed, ref, shallowRef, triggerRef, watch } from 'vue'
import type { RenderData, SimRunnerSlotsConfigJson, SimRunnerSlotsConfigJsonSlotItem } from '../utils/graph/diagramTypes'
import { SimClock } from '../utils/sim/SimClock'
import {
  discoverGraphSlotNames,
  SimGraphRunner,
} from '../utils/sim/SimGraphRunner'
import { SimInputBoard } from '../utils/sim/SimInputBoard'
import {
  AnimDatabaseLibrary,
  animDatabaseLibraryToCompactJson,
  loadAnimDatabaseCsvJson,
  loadCompactAnimDatabaseLibraryJson,
  type AnimDatabaseLibraryJson,
  type AnimDatabaseStats,
} from '../utils/sim/animDatabase'
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
  ClipPoseLibrary,
  type ClipPoseLibraryJson,
  type ClipPoseSetView,
} from '../utils/sim/clipPoseLibrary'
import {
  clipLibraryToCompactJson,
  loadAnimsJsonIntoLibrary,
  loadCompactClipLibraryJson,
} from '../utils/sim/parseAnimsJson'
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
import { RigLibrary, type RigEntry, type RigEntryView, type RigLibraryJson } from '../utils/sim/rigResource'
import { addFrameLogId, clearFrameLogIds } from '../utils/sim/simSampleLog'
import { emptySimSnapshot } from '../utils/sim/simSnapshot'
import type { SimSnapshot } from '../utils/sim/simTypes'
import {
  createDraftAppliedRevisionInfo,
  type DraftBoardEntry,
} from './sim/draftBoardEntry'
import {
  clearDraftChannels,
  createDraftChannels,
  type DraftChannelOnAppliedById,
} from './sim/draftChannels'
import { makeFeatureKey } from './sim/features'
import { IDraftBoard } from './sim/types'

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

  const resolveRemappedDiagramId = (diagramId?: string): string | undefined => {
    if (!diagramId) return
    const next = mapGet(diagramId) ?? diagramId
    return survivingIds.has(next) ? next : undefined
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

    const runnerDiagramId = entry.diagramId && typeof entry.diagramId === 'string' 
      ? entry.diagramId.trim()
      : undefined
    
    const runnerRemappedDiagramId = resolveRemappedDiagramId(runnerDiagramId)
    if (!runnerRemappedDiagramId) continue

    const slotBySlotName: Partial<Record<string, SimRunnerSlotsConfigJsonSlotItem>> = {}
    if (entry.slotBySlotName && typeof entry.slotBySlotName === 'object') {
      for (const slotName in entry.slotBySlotName) {
        const slot = entry.slotBySlotName[slotName]
        if (!slot) continue

        const  _slotDiagramId = slot.diagramId && typeof slot.diagramId === 'string'
          ? slot.diagramId.trim()
          : undefined

        const _slotRunnerId = slot.runnerId && typeof slot.runnerId === 'string'
          ? slot.runnerId.trim()
          : undefined

        slotBySlotName[slotName] = {
          diagramId: resolveRemappedDiagramId(_slotDiagramId),
          runnerId: _slotRunnerId,
        }
      }
    }

    runnersOut[runnerId] = {
      diagramId: runnerRemappedDiagramId,
      slotBySlotName,
    }
  }

  return {
    rootRunnerId: cfg.rootRunnerId ?? ROOT_RUNNER_ID,
    runners: runnersOut,
  }
}

export type SimSlotRunnerInfo = {
  slotName: string
  runnerId: string | undefined
  diagramId: string | undefined
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

const mergeUniqueKeyFeatures = (
  seenFeatureKeysSet: Set<string>, 
  features: { feature: string; property: string }[],
  outputFeatures: { feature: string; property: string }[]
) => {
  for (const item of features) {
    const key = makeFeatureKey(item.feature, item.property)
    if (seenFeatureKeysSet.has(key)) continue
    seenFeatureKeysSet.add(key)
    outputFeatures.push(item)
  }
}

export type SimExternalSimDriver = {
  activate: () => void
  deactivate: () => void
  tick: (dt: number, rawDt?: number) => void
}

export type useAnimgraphSimProps = {
  listDiagramIds: () => string[]
  getRootDiagramId: () => string | undefined
  getDiagramDataById: (diagramId: string) => RenderData | undefined
}

export type Sim = {
  playing: boolean
  speed: number
  clock: SimClock
  board: SimInputBoard
  clipLibrary: ClipLibrary
  animDbLibrary: AnimDatabaseLibrary
  rigLibrary: RigLibrary
  clipPoseLibrary: ClipPoseLibrary
  runnerSlots: SimRunnerSlotsConfigJson
}

/** Sim runtime composable. Prefer singleton via `stores/animgraphSim`. */
export function useAnimgraphSim(props: useAnimgraphSimProps) {
  const { 
    listDiagramIds,
    getRootDiagramId,
    getDiagramDataById,
  } = props

  const diagramIdsListRevisionRef = ref(0)
  const bumpDiagramIdsList = () => {
    diagramIdsListRevisionRef.value++
  }
  const syncToDiagrams = () => {
    bumpDiagramIdsList()
  }

  const diagramIdToDiagramRevisionMap = new Map<string, number>()
  const diagramIdToDiagramRevisionMapComputed = computed(() => {
    void diagramIdsListRevisionRef.value

    for (const diagramId of diagramIdToDiagramRevisionMap.keys()) {
      diagramIdToDiagramRevisionMap.set(diagramId, (diagramIdToDiagramRevisionMap.get(diagramId) ?? 0) + 1)
    }
    return diagramIdToDiagramRevisionMap
  })
  const getDiagramRevision = (diagramId: string) => {
    return diagramIdToDiagramRevisionMapComputed.value.get(diagramId) ?? 0
  }
  const bumpDiagramRevision = (diagramId: string) => {
    diagramIdToDiagramRevisionMapComputed.value.set(diagramId, getDiagramRevision(diagramId) + 1)
    triggerRef(diagramIdToDiagramRevisionMapComputed)
  }
  const syncToDiagram = (diagramId: string) => {
    bumpDiagramRevision(diagramId)
  }

  const clock = shallowRef(new SimClock({
    onPlayingChange: (playing) => {
      playingRef.value = playing
    },
    onSpeedChange: (speed) => {
      speedRef.value = speed
    },
  }))

  const playingRef = ref(clock.value.playing)
  const speedRef = ref(clock.value.speed)

  const clipLibraryRef = shallowRef(new ClipLibrary())
  const clipLibraryRevisionRef = ref(0)
  const bumpClips = () => {
    clipLibraryRevisionRef.value++
  }

  const animDbLibrary = shallowRef(new AnimDatabaseLibrary())
  const animDbRevision = ref(0)
  const bumpAnimDb = () => {
    animDbRevision.value++
  }

  const rigLibrary = shallowRef(new RigLibrary())
  const rigRevision = ref(0)
  const bumpRigs = () => {
    rigRevision.value++
  }

  const clipPoseLibrary = shallowRef(new ClipPoseLibrary())
  const clipPoseRevision = ref(0)
  const bumpClipPose = () => {
    clipPoseRevision.value++
    cachedClipPoseJson = null
    cachedClipPoseCompact = null
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
  
  const runnerIdToRunnerMap = new Map<string, SimGraphRunner>()
  const runnersSequentialIdAllocator = new SequentialIdAllocator('s', (id: string) => runnerIdToRunnerMap.has(id))
  const runnersRev = ref(0)
  const bumpRunners = () => {
    runnersRev.value++
  }
  
  const getRunner = (runnerId: string | null | undefined): SimGraphRunner | undefined => {
    return runnerId ? runnerIdToRunnerMap.get(runnerId) : undefined
  }

  const getPrimaryRunner = () => {
    return getRunner(ROOT_RUNNER_ID)
  }

  const runnerIdToBoundDiagramRevisionCacheMap = new Map<string, number>()
  const runnerIdToBoundDiagramRevisionCacheMapComputed = computed(() => {
    void diagramIdToDiagramRevisionMapComputed.value

    for (const runnerId of runnerIdToBoundDiagramRevisionCacheMap.keys()) {
      const runner = runnerIdToRunnerMap.get(runnerId)
      if (!runner) continue

      if (!runner.diagramId) continue

      ensureDiagramRunner(runnerId, runner.diagramId)
    }
    return runnerIdToBoundDiagramRevisionCacheMap
  })
  const getRunnerBoundDiagramRevision = (runnerId: string) => {
    return runnerIdToBoundDiagramRevisionCacheMapComputed.value.get(runnerId) ?? 0
  }

  /** Per-runner snapshots from last publish. */
  const snapshotsByRunner = shallowRef<Record<string, SimSnapshot>>({})

  /** Bumped each publish; stamped onto every diagram snapshot. */
  let poseGenCounter = 0
  /** Last stack-capture handle ids (selection); first is preferred HUD pose. */
  const stackCaptureHandleIds = ref<string[]>([])
  
  /** Cache: poseGen|diagramId|poseKey → resolved pose + filled derived fields. */
  const derivedPoseCache = new Map<string, DerivedCacheEntry>()
  let derivedPoseCachePoseGen = -1
  
  const active = ref(false)

  const draftBoardEntries: DraftBoardEntry[] = []
  /** Bumps when draft boards register/unregister (UI select lists). */
  const draftBoardIdsRev = ref(0)
  /** Forces all channels to re-merge (unregister / empty stack orphan clear). */
  let draftAppliedKeysNeedReconcile = false
  const draftChannels = createDraftChannels()
  
  const _sortDraftBoardEntries = () => {
    draftBoardEntries.sort((a, b) => {
      const priorityDiff = a.priority - b.priority
      if (priorityDiff !== 0) return priorityDiff
      return a.draftBoard.id.localeCompare(b.draftBoard.id)
    })
  }

  const getDraftBoard = (draftBoardId: string): IDraftBoard | undefined => {
    return draftBoardEntries.find(draftBoardEntry => draftBoardEntry.draftBoard.id === draftBoardId)?.draftBoard
  }

  const listDraftBoardIds = (): string[] => {
    return draftBoardEntries.map((entry) => entry.draftBoard.id)
  }
  
  const registerDraftBoard = (draftBoard: IDraftBoard, priority: number): boolean => {
    if (!draftBoard.id || getDraftBoard(draftBoard.id)) return false
    draftBoardEntries.push({
      draftBoard,
      priority,
      appliedRevisionInfo: createDraftAppliedRevisionInfo(),
    })
    _sortDraftBoardEntries()
    draftBoardIdsRev.value++
    return true
  }
  const unregisterDraftBoard = (draftBoardId: string): boolean => {
    const index = draftBoardEntries.findIndex(draftBoardEntry => draftBoardEntry.draftBoard.id === draftBoardId)
    if (index === -1) return false
    draftBoardEntries.splice(index, 1)
    draftAppliedKeysNeedReconcile = true
    draftBoardIdsRev.value++
    return true
  }

  const onSimBoardCleared = () => {
    clearDraftChannels(draftChannels)
    for (const entry of draftBoardEntries) {
      entry.appliedRevisionInfo = createDraftAppliedRevisionInfo()
    }
    draftAppliedKeysNeedReconcile = false
  }

  const board = shallowRef(new SimInputBoard({ onCleared: onSimBoardCleared }))

  /** Sample-path diagnostics (Blend2 null inputs, …). Off by default. */
  const sampleWarningsEnabled = ref(false)
  const updateWarningsEnabled = ref(false)

  let raf = 0
  let lastTs = 0
  /** Runner ids currently stepping via GraphSlot nest — cycle guard. */
  const nestStack: string[] = []

  const syncSampleResourcesToRunners = () => {
    const rig = rigLibrary.value.getActive()
    for (const runner of runnerIdToRunnerMap.values()) {
      runner.setClipPoseLibrary(clipPoseLibrary.value)
      runner.setActiveRig(rig)
    }
  }

  const isWrapperActive = (name: string) => {
    return board.value.isWrapperActive(name)
  }

  const syncRunnerResources = (r: SimGraphRunner) => {
    r.setClipLibrary(clipLibraryRef.value)
    r.setAnimDatabaseLibrary(animDbLibrary.value)
    r.setClipPoseLibrary(clipPoseLibrary.value)
    r.setActiveRig(rigLibrary.value.getActive())
    r.sampleWarningsEnabled = sampleWarningsEnabled.value
    r.updateWarningsEnabled = updateWarningsEnabled.value
  }

  /**
   * Host mirror when root is destroyed (explicit None): Diagrams UI + persistence
   * without a live unbound runner in the map.
   */
  /** Explicit root None — no live root; persisted as `rootDetached` (not empty diagramId). */
  let rootDetached = false

  const getRootRunnerId = () => ROOT_RUNNER_ID

  /** Prefer root if it runs this diagram; else first match. */
  const findRunnerByDiagramId = (diagramId: string): SimGraphRunner | null => {
    if (!diagramId) return null
    const root = runnerIdToRunnerMap.get(ROOT_RUNNER_ID)
    if (root?.diagramId === diagramId) return root
    for (const r of runnerIdToRunnerMap.values()) {
      if (r.diagramId === diagramId) return r
    }
    return null
  }

  const findRunnersByDiagramId = (diagramId: string): SimGraphRunner[] => {
    if (!diagramId) return []
    const out: SimGraphRunner[] = []
    for (const r of runnerIdToRunnerMap.values()) {
      if (r.diagramId === diagramId) out.push(r)
    }
    return out
  }

  /** Depth-first dispose + delete (including root). Unlinks from parent's slotRunnerIds. */
  const destroyRunner = (runnerId: string) => {
    const runner = runnerIdToRunnerMap.get(runnerId)
    if (!runner) return

    for (const slot of [...runner.graphSlots()]) {
      if (slot.runnerId) destroyRunner(slot.runnerId)
      slot.runnerId = undefined
    }

    // Detach from parent slot map (stale ids otherwise survive serialize).
    for (const otherRunner of runnerIdToRunnerMap.values()) {
      if (otherRunner === runner) continue
      for (const slot of otherRunner.graphSlots()) {
        if (slot.runnerId === runnerId) slot.runnerId = undefined
      }
    }

    runner.dispose()
    runnerIdToRunnerMap.delete(runnerId)

    if (snapshotsByRunner.value[runnerId]) {
      const next = { ...snapshotsByRunner.value }
      delete next[runnerId]
      snapshotsByRunner.value = next
    }
  }

  /**
   * Ensure a runner is bound to a diagram, or destroy when empty (None).
   */
  const ensureDiagramRunner = (
    runnerId: string,
    diagramId?: string | null
  ): SimGraphRunner | undefined => {
    const nextDiagramId = (diagramId ?? '').trim()

    if (!nextDiagramId) {
      if (runnerId === ROOT_RUNNER_ID) rootDetached = true
      destroyRunner(runnerId)
      bumpRunners()
      return
    }

    const nextDiagramData = getDiagramDataById(nextDiagramId)
    if (!nextDiagramData) {
      console.warn(
        `[sim] setRunnerDiagramId: no RenderData for diagramId="${nextDiagramId}" (runner="${runnerId}")`
      )
      if (runnerId === ROOT_RUNNER_ID) rootDetached = true
      destroyRunner(runnerId)
      bumpRunners()
      return
    }

    if (runnerId === ROOT_RUNNER_ID) rootDetached = false
    
    let repopulateRunnerSlots = false
    let simGraphRunner = runnerIdToRunnerMap.get(runnerId)
    if (!simGraphRunner) {
      simGraphRunner = new SimGraphRunner(runnerId)
      runnerIdToRunnerMap.set(runnerId, simGraphRunner)

      repopulateRunnerSlots = true
    }

    if (simGraphRunner.diagramId && (
      simGraphRunner.diagramId !== nextDiagramId ||
      getRunnerBoundDiagramRevision(runnerId) === getDiagramRevision(nextDiagramId)
    )) {
      // SimGraphRunner diagram changed — destroy all child runners.
      for (const simGraphRunnerSlot of simGraphRunner.graphSlots()) {
        if (simGraphRunnerSlot.runnerId) {
          destroyRunner(simGraphRunnerSlot.runnerId)
          simGraphRunnerSlot.runnerId = undefined
        }
      }

      repopulateRunnerSlots = true
    }

    if (repopulateRunnerSlots) {
      const diagramDiscovered = getDiagramDiscovered(nextDiagramId)
      if (diagramDiscovered) {
        for (const slotName of diagramDiscovered.graphSlotNamesSet) {
          simGraphRunner.addGraphSlot(slotName, {})
        }
      } else {
        throw new Error(`[sim] ensureDiagramRunner: no discovered data for diagramId="${nextDiagramId}" (runner="${runnerId}")`)
      }
    }

    // Libraries/rig before bind so compile / StaticSwitch see them.
    syncRunnerResources(simGraphRunner)
    simGraphRunner.bind(nextDiagramId, nextDiagramData, board.value)
    bumpRunners()

    return simGraphRunner
  }

  /**
   * Ensure a child runner exists for a GraphSlot when it has a diagram.
   * Initialized None → destroy child, clear slotRunnerId, return undefined.
   */
  const ensureSlotRunner = (
    simGraphRunner: SimGraphRunner,
    slotName: string
  ): string | undefined => {
    if (!slotName || slotName === 'None') return

    let simGraphRunnerSlot = simGraphRunner.getGraphSlot(slotName)
    if (!simGraphRunnerSlot) {
      simGraphRunnerSlot = simGraphRunner.addGraphSlot(slotName, {})
    }

    if (!simGraphRunnerSlot.diagramId) {
      // Slot has no diagram id, try to assign one.
      if (!simGraphRunnerSlot.diagramLocked) {
        // Slot is not locked, try to assign diagram id from slot name.
        simGraphRunnerSlot.diagramId = findDiagramIdBySlotName(listDiagramIds(), slotName)
      }
    }

    if (!simGraphRunnerSlot.diagramId) {
      // Unresolved slot — no diagram id, cannot create runner.

      if (simGraphRunnerSlot.runnerId) {
        // Slot without diagram id has a runner, destroy it.
        destroyRunner(simGraphRunnerSlot.runnerId)
        simGraphRunnerSlot.runnerId = undefined
      }
      return
    }

    let slotSimGraphRunnerId = simGraphRunnerSlot.runnerId
    if (!slotSimGraphRunnerId) {
      slotSimGraphRunnerId = runnersSequentialIdAllocator.alloc()
    }

    const slotSimGraphRunner = runnerIdToRunnerMap.get(slotSimGraphRunnerId)
    if (!slotSimGraphRunner || slotSimGraphRunner.diagramId !== simGraphRunnerSlot.diagramId) {
      if (ensureDiagramRunner(slotSimGraphRunnerId, simGraphRunnerSlot.diagramId)) {
        simGraphRunnerSlot.runnerId = slotSimGraphRunnerId
      }
    }

    return simGraphRunnerSlot.runnerId
  }

  /** Eagerly create child runners for GraphSlot names on parent's bound diagram (one level). */
  const materializeRunnerSlotRunners = (simGraphRunner: SimGraphRunner) => {
    const diagramGraphSlotNamesSet = simGraphRunner.diagramId
      ? getDiagramDiscovered(simGraphRunner.diagramId)?.graphSlotNamesSet
      : undefined

    if (diagramGraphSlotNamesSet) {
      for (const diagramSlotName of diagramGraphSlotNamesSet) {
        ensureSlotRunner(simGraphRunner, diagramSlotName)
      }
    }

    // Prune slots that are not in the diagram.
    let pruned = false
    for (const slot of [...simGraphRunner.graphSlots()]) {
      if (diagramGraphSlotNamesSet?.has(slot.slotName)) continue
      if (slot.runnerId) destroyRunner(slot.runnerId)
      simGraphRunner.removeGraphSlot(slot.slotName)
      pruned = true
    }
    if (pruned) bumpRunners()
  }

  /** BFS materialize from a runner (cycle-safe). */
  const materializeSlotTree = (startId: string) => {
    const visitedRunnerIdsSet = new Set<string>()
    const runnerIdsQueue = [startId]
    let runnerIdsQueuePos = 0
    while (runnerIdsQueuePos < runnerIdsQueue.length) {
      const runnerId = runnerIdsQueue[runnerIdsQueuePos++]
      if (visitedRunnerIdsSet.has(runnerId)) continue
      visitedRunnerIdsSet.add(runnerId)

      const simGraphRunner = runnerIdToRunnerMap.get(runnerId)
      if (!simGraphRunner) continue

      materializeRunnerSlotRunners(simGraphRunner)

      for (const slot of simGraphRunner.graphSlots()) {
        if (slot.runnerId && !visitedRunnerIdsSet.has(slot.runnerId)) {
          runnerIdsQueue.push(slot.runnerId)
        }
      }
    }
  }

  /**
   * Slots on a bound parent: GraphSlot names + initialized Nones.
   * None slots may have empty runnerId (no live child).
   */
  const listSlotRunners = (runnerId: string): SimSlotRunnerInfo[] => {
    const simGraphRunner = runnerIdToRunnerMap.get(runnerId)
    if (!simGraphRunner?.diagramId) return []

    const out: SimSlotRunnerInfo[] = []
    for (const slot of simGraphRunner.graphSlots()) {
      const slotSimGraphRunner = slot.runnerId
        ? runnerIdToRunnerMap.get(slot.runnerId)
        : undefined
      out.push({
        slotName: slot.slotName,
        runnerId: slot.runnerId,
        diagramId: slotSimGraphRunner?.diagramId,
      })
    }
    return out
  }

  const setSlotDiagramId = (
    runnerId: string,
    slotName: string,
    diagramId: string | null
  ) => {
    const simGraphRunner = runnerIdToRunnerMap.get(runnerId)
    if (!simGraphRunner) {
      console.warn(
        `[sim] setSlotDiagramId: missing runner "${runnerId}"`
      )
      return
    }

    const _slotName = slotName.trim()
    if (!_slotName || _slotName === 'None') return

    let simGraphRunnerSlot = simGraphRunner.getGraphSlot(_slotName)
    if (simGraphRunnerSlot) {
      simGraphRunnerSlot.diagramId = diagramId || undefined
      simGraphRunnerSlot.diagramLocked = true
    } else {
      simGraphRunnerSlot = simGraphRunner.addGraphSlot(_slotName, {
        diagramId: diagramId || undefined,
        diagramLocked: true,
      })
    }

    if (!diagramId) {
      const slotSimGraphRunnerId = simGraphRunnerSlot.runnerId
      if (slotSimGraphRunnerId) destroyRunner(slotSimGraphRunnerId)
      simGraphRunnerSlot.runnerId = undefined
      bumpRunners()
      return
    }

    const slotSimGraphRunnerId = ensureSlotRunner(simGraphRunner, _slotName)
    if (slotSimGraphRunnerId) {
      // ensureDiagramRunner(slotSimGraphRunnerId, diagramId)
      materializeSlotTree(slotSimGraphRunnerId)
    } else {
      bumpRunners()
    }
  }

  /** Bound runners only (diagram set) — for Skeleton / Status pickers. */
  const listBoundRunnerTree = (): SimRunnerTreeNode | null => {
    const rootId = ROOT_RUNNER_ID
    const root = runnerIdToRunnerMap.get(rootId)
    if (!root?.diagramId) return null

    const visited = new Set<string>()

    const build = (
      label: string,
      runnerId: string,
    ): SimRunnerTreeNode | null => {
      if (visited.has(runnerId)) return null
      visited.add(runnerId)

      const simGraphRunner = runnerIdToRunnerMap.get(runnerId)
      if (!simGraphRunner) return null

      if (!simGraphRunner.diagramId) return null

      const children: SimRunnerTreeNode[] = []
      for (const slotInfo of listSlotRunners(runnerId)) {
        if (!slotInfo.runnerId || !slotInfo.diagramId) continue
        const child = build(slotInfo.slotName, slotInfo.runnerId)
        if (child) children.push(child)
      }

      return {
        runnerId,
        diagramId: simGraphRunner.diagramId,
        label,
        title: `${label} (${simGraphRunner.diagramId})`,
        children,
      }
    }

    return build('root', rootId)
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

  /**
   * Host / SimPanel view: always root runner snap + live clock fields.
   * Diagram-scoped UI must use `snapshotForRunner` / `snapshotForDiagram`
   * (do not guess via activeDiagramId here).
   */
  const snapshot = computed((): SimSnapshot => {
    return snapshotsByRunner.value[ROOT_RUNNER_ID] ?? emptySimSnapshot()
  })

  const discoveredCacheMapComputed = computed(() => {
    void diagramIdsListRevisionRef.value
    return new Map<string, { 
      diagramRevision: number, 
      data: {
        graphInputs: DiscoveredGraphInputs
        graphSlotNamesSet: Set<string>
      }, 
    }>()
  })
  const discoveredCacheMapContentRevisionRef = ref(0)
  const bumpDiscoveredCacheMapContentRevision = () => {
    discoveredCacheMapContentRevisionRef.value++
  }
  const getDiagramDiscovered = (diagramId: string) => {
    const discoveredCacheMap = discoveredCacheMapComputed.value
    
    const diagramRevision = getDiagramRevision(diagramId)
    const cacheItem = discoveredCacheMap.get(diagramId)
    if (cacheItem && cacheItem.diagramRevision === diagramRevision) {
      return cacheItem.data
    }

    const data = getDiagramDataById(diagramId)
    if (!data) {
      discoveredCacheMap.delete(diagramId)
      return
    }

    const nextCacheItem = {
      diagramRevision,
      data: {
        graphInputs: discoverGraphInputs(data.handlesRegistry),
        graphSlotNamesSet: discoverGraphSlotNames(data.handlesRegistry),
      },
    }
    discoveredCacheMap.set(diagramId, nextCacheItem)
    bumpDiscoveredCacheMapContentRevision()

    return nextCacheItem.data
  }

  const allDiagramsDiscoveredComputed = computed(() => {
    const diagramIds = listDiagramIds()

    const floatFeatureKeysSet = new Set<string>()
    const floatFeatures: { feature: string; property: string }[] = []
    const vectorFeatureKeysSet = new Set<string>()
    const vectorFeatures: { feature: string; property: string }[] = []
    const quatFeatureKeysSet = new Set<string>()
    const quatFeatures: { feature: string; property: string }[] = []
    const boolFeatureKeysSet = new Set<string>()
    const boolFeatures: { feature: string; property: string }[] = []
    const stringFeatureKeysSet = new Set<string>()
    const stringFeatures: { feature: string; property: string }[] = []

    const floatVarNamesSet = new Set<string>()
    const vectorVarNamesSet = new Set<string>()
    const quatVarNamesSet = new Set<string>()
    const transformVarNamesSet = new Set<string>()
    const boolVarNamesSet = new Set<string>()
    const intVarNamesSet = new Set<string>()
    const wrapperNamesSet = new Set<string>()
    const eventNamesSet = new Set<string>()
    const tagNamesSet = new Set<string>()
    const entityTagNamesSet = new Set<string>()

    for (const diagramId of diagramIds) {
      const diagramDiscovered = getDiagramDiscovered(diagramId)
      if (!diagramDiscovered) continue

      mergeUniqueKeyFeatures(floatFeatureKeysSet, diagramDiscovered.graphInputs.floatFeatures, floatFeatures)
      mergeUniqueKeyFeatures(vectorFeatureKeysSet, diagramDiscovered.graphInputs.vectorFeatures, vectorFeatures)
      mergeUniqueKeyFeatures(quatFeatureKeysSet, diagramDiscovered.graphInputs.quatFeatures, quatFeatures)
      mergeUniqueKeyFeatures(boolFeatureKeysSet, diagramDiscovered.graphInputs.boolFeatures, boolFeatures)
      mergeUniqueKeyFeatures(stringFeatureKeysSet, diagramDiscovered.graphInputs.stringFeatures, stringFeatures)

      mergeSets(diagramDiscovered.graphInputs.floatVarNamesSet, floatVarNamesSet)
      mergeSets(diagramDiscovered.graphInputs.vectorVarNamesSet, vectorVarNamesSet)
      mergeSets(diagramDiscovered.graphInputs.quatVarNamesSet, quatVarNamesSet)
      mergeSets(diagramDiscovered.graphInputs.transformVarNamesSet, transformVarNamesSet)
      mergeSets(diagramDiscovered.graphInputs.boolVarNamesSet, boolVarNamesSet)
      mergeSets(diagramDiscovered.graphInputs.intVarNamesSet, intVarNamesSet)
      mergeSets(diagramDiscovered.graphInputs.wrapperNamesSet, wrapperNamesSet)
      mergeSets(diagramDiscovered.graphInputs.eventNamesSet, eventNamesSet)
      mergeSets(diagramDiscovered.graphInputs.tagNamesSet, tagNamesSet)
      mergeSets(diagramDiscovered.graphInputs.entityTagNamesSet, entityTagNamesSet)
    }

    return {
      floatFeatureKeysSet,
      floatFeatures,
      vectorFeatureKeysSet,
      vectorFeatures,
      quatFeatureKeysSet,
      quatFeatures,
      boolFeatureKeysSet,
      boolFeatures,
      stringFeatureKeysSet,
      stringFeatures,
      floatVarNamesSet,
      vectorVarNamesSet,
      quatVarNamesSet,
      transformVarNamesSet,
      boolVarNamesSet,
      intVarNamesSet,
      wrapperNamesSet,
      eventNamesSet,
      tagNamesSet,
      entityTagNamesSet,
    }
  })

  const discoveredClipLibraryClipEventNamesSetComputed = computed(() => {
    void clipLibraryRevisionRef.value
    return new Set(clipLibraryRef.value.eventNames())
  })

  const discoveredClipLibraryWrapperNamesSetComputed = computed(() => {
    void clipLibraryRevisionRef.value
    return new Set(clipLibraryRef.value.wrapperNames())
  })

  const discovered = computed(() => {
    void clipLibraryRevisionRef.value

    const allDiagramsDiscovered = allDiagramsDiscoveredComputed.value

    const floatFeatures = allDiagramsDiscovered.floatFeatures
    const vectorFeatures = allDiagramsDiscovered.vectorFeatures
    const quatFeatures = allDiagramsDiscovered.quatFeatures
    const boolFeatures = allDiagramsDiscovered.boolFeatures
    const stringFeatures = allDiagramsDiscovered.stringFeatures
    const floatVarNames = Array.from(allDiagramsDiscovered.floatVarNamesSet)
    const vectorVarNames = Array.from(allDiagramsDiscovered.vectorVarNamesSet)
    const quatVarNames = Array.from(allDiagramsDiscovered.quatVarNamesSet)
    const transformVarNames = Array.from(allDiagramsDiscovered.transformVarNamesSet)
    const boolVarNames = Array.from(allDiagramsDiscovered.boolVarNamesSet)
    const intVarNames = Array.from(allDiagramsDiscovered.intVarNamesSet)
    const wrapperNames = Array.from(allDiagramsDiscovered.wrapperNamesSet)
    const wrapperNamesSet = new Set(allDiagramsDiscovered.wrapperNamesSet)
    const eventNames = Array.from(allDiagramsDiscovered.eventNamesSet)
    const eventNamesSet = new Set(allDiagramsDiscovered.eventNamesSet)
    const tagNames = Array.from(allDiagramsDiscovered.tagNamesSet)

    mergeUniqueStrings(
      eventNamesSet, 
      Array.from(discoveredClipLibraryClipEventNamesSetComputed.value), 
      eventNames
    )

    mergeUniqueStrings(
      wrapperNamesSet, 
      Array.from(discoveredClipLibraryWrapperNamesSetComputed.value), 
      wrapperNames
    )

    floatFeatures.sort((a, b) =>
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
    floatVarNames.sort((a, b) => a.localeCompare(b))
    vectorVarNames.sort((a, b) => a.localeCompare(b))
    quatVarNames.sort((a, b) => a.localeCompare(b))
    transformVarNames.sort((a, b) => a.localeCompare(b))
    boolVarNames.sort((a, b) => a.localeCompare(b))
    intVarNames.sort((a, b) => a.localeCompare(b))
    wrapperNames.sort((a, b) => a.localeCompare(b))
    eventNames.sort((a, b) => a.localeCompare(b))
    tagNames.sort((a, b) => a.localeCompare(b))

    return {
      floatFeatureKeysSet: allDiagramsDiscovered.floatFeatureKeysSet,
      floatFeatures,
      vectorFeatureKeysSet: allDiagramsDiscovered.vectorFeatureKeysSet,
      vectorFeatures,
      quatFeatureKeysSet: allDiagramsDiscovered.quatFeatureKeysSet,
      quatFeatures,
      boolFeatureKeysSet: allDiagramsDiscovered.boolFeatureKeysSet,
      boolFeatures,
      stringFeatureKeysSet: allDiagramsDiscovered.stringFeatureKeysSet,
      stringFeatures,
      floatVarNamesSet: allDiagramsDiscovered.floatVarNamesSet,
      floatVarNames,
      vectorVarNamesSet: allDiagramsDiscovered.vectorVarNamesSet,
      vectorVarNames,
      quatVarNamesSet: allDiagramsDiscovered.quatVarNamesSet,
      quatVarNames,
      transformVarNamesSet: allDiagramsDiscovered.transformVarNamesSet,
      transformVarNames,
      boolVarNamesSet: allDiagramsDiscovered.boolVarNamesSet,
      boolVarNames,
      intVarNamesSet: allDiagramsDiscovered.intVarNamesSet,
      intVarNames,
      wrapperNamesSet,
      wrapperNames,
      eventNamesSet,
      eventNames,
      tagNamesSet: allDiagramsDiscovered.tagNamesSet,
      tagNames,
    }
  })

  const clipStats = computed((): ClipLibraryStats => {
    void clipLibraryRevisionRef.value
    return clipLibraryRef.value.stats()
  })

  const clipNames = computed((): string[] => {
    void clipLibraryRevisionRef.value
    return clipLibraryRef.value.names()
  })

  const setupEntries = computed((): AnimSetupEntryView[] => {
    void clipLibraryRevisionRef.value
    void boardWrapperWeightsRevisionRef.value
    return clipLibraryRef.value.listEntries(isWrapperActive)
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
    poseSetId?: string | null
  ): { name: string; duration: number } | null => {
    void clipPoseRevision.value
    return clipPoseLibrary.value.getAnimInfo(clipName, poseSetId)
  }

  const listGlbAnimNames = (poseSetId: string): string[] => {
    void clipPoseRevision.value
    return clipPoseLibrary.value.listAnimNames(poseSetId)
  }

  const boardWrapperWeightsRevisionRef = ref(0)

  const draftChannelOnAppliedById: DraftChannelOnAppliedById = {
    wrapperWeights: () => {
      boardWrapperWeightsRevisionRef.value++
    },
    entityTags: () => {
      invalidateAllStaticSwitches()
    },
  }

  const applyDraftsToBoard = () => {
    const simBoard = board.value
    const needReconcile = draftAppliedKeysNeedReconcile
    for (const channel of draftChannels) {
      if (channel.apply(needReconcile, draftBoardEntries, simBoard)) {
        draftChannelOnAppliedById[channel.id]?.()
      }
    }
    draftAppliedKeysNeedReconcile = false
  }

  const updateRunner = (
    runner: SimGraphRunner,
    poseGen: number,
    dt: number,
    rawDt: number,
    slotHost: SimGraphUpdateSlotHost,
  ): SimSnapshot => {
    nestStack.push(runner.runnerId)
    try {
      return runner.update({
        poseGen,
        dt,
        rawDt,
        playing: clock.value.playing,
        time: clock.value.time,
        speed: clock.value.speed,
        board: board.value,
        slotHost,
      })
    } finally {
      nestStack.pop()
    }
  }

  const sampleRunner = (
    runner: SimGraphRunner,
    poseGen: number,
    dt: number,
    rawDt: number,
    slotHost: SimGraphSampleSlotHost,
  ): Pose | undefined => {
    nestStack.push(runner.runnerId)
    try {
      return runner.sample({
        poseGen,
        dt,
        rawDt,
        playing: clock.value.playing,
        time: clock.value.time,
        speed: clock.value.speed,
        board: board.value,
        slotHost,
      })
    } finally {
      nestStack.pop()
    }
  }

  const makeSimGraphUpdateSlotHost = (
    simGraphRunnerId: string,
    poseGen: number,
    dt: number,
    rawDt: number,
    simGraphRunnerIdToSimSnapshot: Record<string, SimSnapshot>,
    updateInput?: SimGraphUpdateSlotHost['updateInput'],
  ): SimGraphUpdateSlotHost => {
    return {
      updateNested(slotName, updateInput) {
        const simGraphRunner = runnerIdToRunnerMap.get(simGraphRunnerId)
        if (!simGraphRunner) {
          console.warn(
            `[sim] sampleNested (slot="${slotName}") missing runner "${simGraphRunnerId}"`
          )
          return
        }

        const simGraphRunnerSlot = simGraphRunner.getGraphSlot(slotName)
        if (simGraphRunnerSlot && simGraphRunnerSlot.diagramLocked && !simGraphRunnerSlot.diagramId) {
          // Explicit None → passthrough (do not step a child graph).
          return
        }

        const slotSimGraphRunnerId = ensureSlotRunner(simGraphRunner, slotName)
        if (!slotSimGraphRunnerId || nestStack.includes(slotSimGraphRunnerId)) return
        
        const slotSimGraphRunner = runnerIdToRunnerMap.get(slotSimGraphRunnerId)
        if (!slotSimGraphRunner || !slotSimGraphRunner.diagramId) {
          console.warn('[sim] sampleNested: missing slot runner or runner is not bound to a diagram')
          return
        }
  
        // @TODO: code smell
        // Share LookAt sample-context fields with parent (engine one AnimNodeSampleContext).
        slotSimGraphRunner.eyesLookAtEnabled = simGraphRunner.eyesLookAtEnabled
        slotSimGraphRunner.entityLocalToWorld = simGraphRunner.entityLocalToWorld
        slotSimGraphRunner.parentObjectLocalToWorld = simGraphRunner.parentObjectLocalToWorld
        
        const snapshot = updateRunner(
          slotSimGraphRunner,
          poseGen,
          dt,
          rawDt,
          makeSimGraphUpdateSlotHost(
            slotSimGraphRunnerId, 
            poseGen, 
            dt, 
            rawDt, 
            simGraphRunnerIdToSimSnapshot, 
            updateInput
          ),
        )

        // @TODO: code smell
        simGraphRunner.eyesLookAtEnabled = slotSimGraphRunner.eyesLookAtEnabled

        simGraphRunnerIdToSimSnapshot[slotSimGraphRunnerId] = snapshot

        return {
          diagramId: slotSimGraphRunner.diagramId,
          snap: snapshot,
          inertialization: {
            isInertializationRequested:
              slotSimGraphRunner.inertializationRequest.isInertializationRequested,
            inertializationDuration:
            slotSimGraphRunner.inertializationRequest.inertializationDuration,
          },
          keepFullUpdate: slotSimGraphRunner.lastKeepFullUpdate,
        }
      },
      updateInput,
    }
  }

  const makeSimGraphSampleSlotHost = (
    simGraphRunnerId: string,
    poseGen: number,
    dt: number,
    rawDt: number,
    sampleInput?: SimGraphSampleSlotHost['sampleInput'],
  ): SimGraphSampleSlotHost => {
    return {
      sampleNested(slotName, sampleInput) {
        const simGraphRunner = runnerIdToRunnerMap.get(simGraphRunnerId)
        if (!simGraphRunner) {
          console.warn(
            `[sim] sampleNested (slot="${slotName}") missing runner "${simGraphRunnerId}"`
          )
          return
        }

        const simGraphRunnerSlot = simGraphRunner.getGraphSlot(slotName)
        if (simGraphRunnerSlot && simGraphRunnerSlot.diagramLocked && !simGraphRunnerSlot.diagramId) {
          // Explicit None → passthrough (do not step a child graph).
          return
        }

        const slotSimGraphRunnerId = ensureSlotRunner(simGraphRunner, slotName)
        if (!slotSimGraphRunnerId || nestStack.includes(slotSimGraphRunnerId)) return
        
        const slotSimGraphRunner = runnerIdToRunnerMap.get(slotSimGraphRunnerId)
        if (!slotSimGraphRunner || !slotSimGraphRunner.diagramId) {
          console.warn('[sim] sampleNested: missing slot runner or runner is not bound to a diagram')
          return
        }

        // @TODO: code smell
        slotSimGraphRunner.eyesLookAtEnabled = simGraphRunner.eyesLookAtEnabled
        slotSimGraphRunner.entityLocalToWorld = simGraphRunner.entityLocalToWorld
        slotSimGraphRunner.parentObjectLocalToWorld = simGraphRunner.parentObjectLocalToWorld

        return sampleRunner(
          slotSimGraphRunner,
          poseGen,
          dt,
          rawDt,
          makeSimGraphSampleSlotHost(slotSimGraphRunnerId, poseGen, dt, rawDt, sampleInput),
        )
      },
      sampleInput,
    }
  }

  const externalSimDriverRef = ref<SimExternalSimDriver | undefined>(undefined)

  const acquireExternalSimDriver = (): SimExternalSimDriver | undefined => {
    if (externalSimDriverRef.value) return
    const driver: SimExternalSimDriver = {
      activate: () => {
        clock.value.reset()
        board.value.clearAll()
        for (const runner of runnerIdToRunnerMap.values()) runner.reset(board.value)
        
        active.value = true
        clock.value.play()
        _publish(0)
        _syncLoop()
      },
      deactivate: () => {
        active.value = false
        clock.value.reset()
        _publish(0)
        _syncLoop()
      },
      tick: (dt: number, rawDt?: number) => {
        clock.value.tickExternal(dt, rawDt)
        _publish(dt, clock.value.lastRawDt)
      }
    }
    externalSimDriverRef.value = driver
    return driver
  }

  const releaseExternalSimDriver = (driver: SimExternalSimDriver): boolean => {
    if (externalSimDriverRef.value !== driver) return false
    externalSimDriverRef.value = undefined
    return true
  }

  const _publish = (dt: number, rawDt = dt) => {
    if (!active.value) return

    applyDraftsToBoard()

    poseGenCounter += 1
    const poseGen = poseGenCounter

    const simGraphRunnerIdToSimSnapshot: Record<string, SimSnapshot> = {}

    let rootSimGraphRunner = runnerIdToRunnerMap.get(ROOT_RUNNER_ID)
    if (!rootSimGraphRunner && !rootDetached) {
      const rootDiagramId = getRootDiagramId()
      if (rootDiagramId && listDiagramIds().includes(rootDiagramId)) {
        rootSimGraphRunner = ensureDiagramRunner(ROOT_RUNNER_ID, rootDiagramId)
        materializeSlotTree(ROOT_RUNNER_ID)
      }
    }
    if (!rootSimGraphRunner) {
      // Unable to resolve root runner
      board.value.endFrame()
      snapshotsByRunner.value = simGraphRunnerIdToSimSnapshot
      return
    }

    if (__ENABLE_SIM_DEBUG__) {
      if (board.value.externalEvents.has("DoubleJump")) {
        addFrameLogId(`DoubleJump`)
      }
    }

    simGraphRunnerIdToSimSnapshot[ROOT_RUNNER_ID] = updateRunner(
      rootSimGraphRunner,
      poseGen,
      dt,
      rawDt,
      makeSimGraphUpdateSlotHost(
        ROOT_RUNNER_ID, 
        poseGen, 
        dt, 
        rawDt, 
        simGraphRunnerIdToSimSnapshot
      ),
    )

    sampleRunner(
      rootSimGraphRunner,
      poseGen,
      dt,
      rawDt,
      makeSimGraphSampleSlotHost(
        ROOT_RUNNER_ID, 
        poseGen, 
        dt, 
        rawDt, 
      ),
    )

    board.value.endFrame()
    snapshotsByRunner.value = simGraphRunnerIdToSimSnapshot

    if (__ENABLE_SIM_DEBUG__) {
      clearFrameLogIds()
    }
  }

  const _stopLoop = () => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    lastTs = 0
  }

  const _loop = (ts: number) => {
    if (!active.value || !clock.value.playing) {
      raf = 0
      lastTs = 0
      return
    }
    raf = requestAnimationFrame(_loop)
    if (!lastTs) lastTs = ts
    const wall = ts - lastTs
    lastTs = ts
    const dt = clock.value.tickWall(wall)
    if (dt > 0) _publish(dt, clock.value.lastRawDt)
  }

  const _syncLoop = () => {
    const nextLoopActive = active.value && 
      clock.value.playing &&
      !externalSimDriverRef.value
    if (!nextLoopActive) {
      _stopLoop()
      return
    }

    if (!raf) {
      lastTs = 0
      raf = requestAnimationFrame(_loop)
    }
  }

  const rebind = () => {
    const diagramIds = listDiagramIds()
    const diagramIdsSet = new Set(diagramIds)
    
    // Snapshot topology before teardown (preserves rootDetached via serialize).
    const saved = serializeRunnerSlots()

    board.value.clearAll()
    applyRunnerSlotsConfig(saved)

    // Invalidate slot→diagram bindings whose diagrams left the project.
    for (const simGraphRunner of [...runnerIdToRunnerMap.values()]) {
      if (simGraphRunner.diagramId && !diagramIdsSet.has(simGraphRunner.diagramId)) {
        destroyRunner(simGraphRunner.runnerId)
        continue
      }

      for (const slot of [...simGraphRunner.graphSlots()]) {
        if (!slot.diagramId || !slot.runnerId) continue
        if (diagramIdsSet.has(slot.diagramId)) continue

        destroyRunner(slot.runnerId)
        slot.runnerId = undefined
      }
    }

    clock.value.reset()

    snapshotsByRunner.value = {}
    bumpRunners()
    _publish(0)
    _syncLoop()
  }

  const dispose = () => {
    _stopLoop()
  }

  const play = () => {
    if (externalSimDriverRef.value) {
      return
    }

    clock.value.play()
    _publish(0)
    _syncLoop()
  }
  
  const pause = () => {
    if (externalSimDriverRef.value) {
      return
    }

    clock.value.pause()
    _publish(0)
    _syncLoop()
  }

  const toggle = () => {
    if (externalSimDriverRef.value) {
      return
    }

    clock.value.toggle()
    _publish(0)
    _syncLoop()
  }

  const step = () => {
    if (externalSimDriverRef.value) {
      return
    }

    const dt = clock.value.step()
    _publish(dt, clock.value.lastRawDt)
  }

  const update = () => {
    if (externalSimDriverRef.value) {
      return
    }

    _publish(0)
  }

  const reset = () => {
    if (externalSimDriverRef.value) {
      return
    }

    clock.value.reset()
    board.value.resetDynamics()
    for (const runner of runnerIdToRunnerMap.values()) runner.reset(board.value)
    _publish(0)
    _syncLoop()
  }

  const activate = () => {
    if (externalSimDriverRef.value) {
      return
    }

    active.value = true
    _publish(0)
    _syncLoop()
  }

  const deactivate = () => {
    if (externalSimDriverRef.value) {
      return
    }

    active.value = false
    clock.value.pause()
    _syncLoop()
  }

  const toggleActivation = () => {
    if (active.value) {
      deactivate()
    } else {
      activate()
    }
  }

  const setSpeed = (s: number) => {
    if (externalSimDriverRef.value) {
      return
    }

    clock.value.setSpeed(s)
  }

  const fireExternal = (eventName: string) => {
    if (!eventName) return
    board.value.fireExternalEvent(eventName)
    _publish(0)
  }

  const fireAnimEvent = (eventName: string, value?: number) => {
    if (!eventName) return
    board.value.injectAnimEventNow(
      eventName,
      value !== undefined && Number.isFinite(value) ? value : undefined
    )
    _publish(0)
  }

  const fireAnimEnd = (eventName?: string) => {
    board.value.fireAnimEnd(eventName || undefined)
    _publish(0)
  }

  const invalidateAllStaticSwitches = () => {
    for (const r of runnerIdToRunnerMap.values()) r.invalidateStaticSwitches()
  }

  const loadAnimsetJson = (
    json: unknown,
    sourceLabel?: string,
    options?: { priority?: number; variableNames?: string[] }
  ) => {
    const result = loadAnimsJsonIntoLibrary(clipLibraryRef.value, json, sourceLabel, {
      priority: options?.priority ?? DEFAULT_ANIM_SETUP_PRIORITY,
      variableNames: options?.variableNames,
    })
    bumpClips()
    _publish(0)
    return result
  }

  const loadClipLibraryJson = (json: unknown, sourceLabel?: string): number => {
    const n = loadCompactClipLibraryJson(clipLibraryRef.value, json, sourceLabel)
    bumpClips()
    _publish(0)
    return n
  }

  const clearClipLibrary = () => {
    clipLibraryRef.value.clear()
    clipPoseLibrary.value.clear()
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    _publish(0)
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
    const entry = clipLibraryRef.value.getEntry(setupEntryId)
    if (!entry) {
      console.warn('loadAnimsetGlb: unknown setupEntryId', setupEntryId)
      return 0
    }
    if (entry.poseSetId) {
      clipPoseLibrary.value.remove(entry.poseSetId)
    }
    const typesFromJson = clipLibraryRef.value.getAnimationTypesForEntry(setupEntryId)
    const { id: poseId, animCount } = clipPoseLibrary.value.loadGlb(
      buffer,
      sourceLabel,
      typesFromJson
    )
    clipLibraryRef.value.setEntryPoseSetId(setupEntryId, poseId)
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    _publish(0)
    return animCount
  }

  const clearAnimsetGlb = (setupEntryId: string) => {
    const entry = clipLibraryRef.value.getEntry(setupEntryId)
    if (!entry?.poseSetId) return
    clipPoseLibrary.value.remove(entry.poseSetId)
    clipLibraryRef.value.setEntryPoseSetId(setupEntryId, null)
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    _publish(0)
  }

  const clearClipPoseLibrary = () => {
    clipPoseLibrary.value.clear()
    for (const e of clipLibraryRef.value.listEntries()) {
      if (e.poseSetId) clipLibraryRef.value.setEntryPoseSetId(e.id, null)
    }
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    _publish(0)
  }

  const loadRigJson = (json: unknown, sourceLabel?: string): string => {
    const id = rigLibrary.value.addFromJson(json, sourceLabel || 'rig')
    bumpRigs()
    syncSampleResourcesToRunners()
    _publish(0)
    return id
  }

  const removeRig = (id: string) => {
    if (!rigLibrary.value.remove(id)) return
    bumpRigs()
    syncSampleResourcesToRunners()
    _publish(0)
  }

  const setActiveRig = (id: string | null) => {
    if (!rigLibrary.value.setActive(id)) return
    bumpRigs()
    syncSampleResourcesToRunners()
    _publish(0)
  }

  const clearRigLibrary = () => {
    rigLibrary.value.clear()
    bumpRigs()
    syncSampleResourcesToRunners()
    _publish(0)
  }

  const setStackCaptureHandleIds = (ids: string[]) => {
    const cleaned = ids.map((id) => id.trim()).filter(Boolean)
    stackCaptureHandleIds.value = cleaned
    for (const runner of runnerIdToRunnerMap.values()) {
      // Only capture on diagrams that own the handle (avoid ranged looking for player_base ids).
      runner.setStackCaptureHandleIds(cleaned.filter((id) => runner.hasHandle(id)))
    }
    _publish(0)
  }

  const setSampleWarningsEnabled = (on: boolean) => {
    sampleWarningsEnabled.value = on
    for (const runner of runnerIdToRunnerMap.values()) {
      runner.sampleWarningsEnabled = on
    }
    _publish(0)
  }

  const setUpdateWarningsEnabled = (on: boolean) => {
    updateWarningsEnabled.value = on
    for (const runner of runnerIdToRunnerMap.values()) {
      runner.updateWarningsEnabled = on
    }
    _publish(0)
  }

  const resolveRunnerPose = (
    runnerId: string,
    poseRef: DerivedPoseRef
  ): { pose: Pose | null; rig: RigEntry | null } => {
    const runner = runnerIdToRunnerMap.get(runnerId)
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
    if (derivedPoseCachePoseGen !== poseGen) {
      derivedPoseCache.clear()
      derivedPoseCachePoseGen = poseGen
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
    _publish(0)
    return db.pathKey
  }

  const loadAnimDatabaseLibraryJson = (json: object, sourceLabel?: string): number => {
    const n = loadCompactAnimDatabaseLibraryJson(animDbLibrary.value, json, sourceLabel)
    bumpAnimDb()
    _publish(0)
    return n
  }

  const clearAnimDatabaseLibrary = () => {
    animDbLibrary.value.clear()
    bumpAnimDb()
    _publish(0)
  }

  const removeAnimDatabase = (pathKey: string) => {
    if (!animDbLibrary.value.remove(pathKey)) return
    bumpAnimDb()
    _publish(0)
  }

  const updateSetupEntry = (
    id: string,
    patch: { priority?: number; variableNames?: string[]; tags?: string[] }
  ) => {
    if (!clipLibraryRef.value.updateEntry(id, patch)) return
    bumpClips()
    _publish(0)
  }

  const removeSetupEntry = (id: string) => {
    const entry = clipLibraryRef.value.getEntry(id)
    if (entry?.poseSetId) {
      clipPoseLibrary.value.remove(entry.poseSetId)
    }
    if (!clipLibraryRef.value.removeEntry(id)) return
    bumpClips()
    bumpClipPose()
    syncSampleResourcesToRunners()
    _publish(0)
  }

  const getClip = (name: string): ClipMeta | undefined => {
    void clipLibraryRevisionRef.value
    void boardWrapperWeightsRevisionRef.value
    return clipLibraryRef.value.resolveClip(name, isWrapperActive)
  }

  const lookupClip = (name: string): ClipMeta | undefined => {
    void clipLibraryRevisionRef.value
    return clipLibraryRef.value.lookup(name)
  }

  const getClipInEntry = (name: string, entryId: string): ClipMeta | undefined => {
    void clipLibraryRevisionRef.value
    return clipLibraryRef.value.getClipInEntry(name, entryId)
  }

  const isClipActive = (name: string): boolean => getClip(name) !== undefined

  const listClipSets = (name: string): ClipSetMembership[] => {
    void clipLibraryRevisionRef.value
    void boardWrapperWeightsRevisionRef.value
    return clipLibraryRef.value.entriesContainingClip(name, isWrapperActive)
  }

  const exportCompactClipLibrary = () => {
    return clipLibraryToCompactJson(clipLibraryRef.value)
  }

  const exportCompactAnimDatabaseLibrary = () => {
    return animDatabaseLibraryToCompactJson(animDbLibrary.value)
  }

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

    const rootRunner = runnerIdToRunnerMap.get(ROOT_RUNNER_ID)
    if (!rootRunner || !rootRunner.diagramId) {
      return undefined
    }

    const onlyRootDefault =
      runnerIdToRunnerMap.size <= 1 &&
      rootRunner.diagramId === getRootDiagramId() &&
      rootRunner.haveLockedGraphSlots() === false
    if (onlyRootDefault) return undefined

    // Map holds only live bound runners — no reachability walk needed.
    const runnersJson: SimRunnerSlotsConfigJson['runners'] = {}
    for (const [runnerId, runner] of runnerIdToRunnerMap) {
      if (!runner.diagramId) continue

      const slotBySlotName: Partial<Record<string, SimRunnerSlotsConfigJsonSlotItem>> = {}
      for (const slot of runner.graphSlots()) {
        if (!slot.diagramLocked) continue
        slotBySlotName[slot.slotName] = {
          diagramId: slot.diagramId,
          runnerId: slot.runnerId,
        }
      }

      runnersJson[runnerId] = {
        diagramId: runner.diagramId,
        slotBySlotName,
      }
    }
    return { rootRunnerId: ROOT_RUNNER_ID, runners: runnersJson }
  }

  function applyRunnerSlotsConfig(cfg: SimRunnerSlotsConfigJson | null | undefined) {
    for (const id of [...runnerIdToRunnerMap.keys()]) destroyRunner(id)
    
    rootDetached = false
    const diagramIds = listDiagramIds()
    const diagramIdsSet = new Set(diagramIds)

    if (cfg?.rootDetached === true) {
      rootDetached = true
      bumpRunners()
      return
    }

    if (!cfg?.runners || typeof cfg.runners !== 'object') {
      const rootDiagramId = getRootDiagramId()
      if (rootDiagramId && diagramIdsSet.has(rootDiagramId)) {
        ensureDiagramRunner(ROOT_RUNNER_ID, rootDiagramId)
        materializeSlotTree(ROOT_RUNNER_ID)
      }
      return
    }

    const rootSimGraphRunnerId = cfg.rootRunnerId && typeof cfg.rootRunnerId === 'string'
      ? cfg.rootRunnerId.trim()
      : ROOT_RUNNER_ID

    const rootEntry = cfg.runners[rootSimGraphRunnerId]
    const rootEntryDiagramId = rootEntry?.diagramId
    if (!rootEntry || 
      !rootEntryDiagramId || typeof rootEntryDiagramId !== 'string' || 
      !diagramIds.includes(rootEntryDiagramId)
    ) {
      const rootDiagramId = getRootDiagramId()
      if (rootDiagramId && diagramIdsSet.has(rootDiagramId)) {
        ensureDiagramRunner(ROOT_RUNNER_ID, rootDiagramId)
        materializeSlotTree(ROOT_RUNNER_ID)
      }
      return
    }

    const rootSimGraphRunner = ensureDiagramRunner(ROOT_RUNNER_ID, rootEntryDiagramId)
    if (!rootSimGraphRunner) {
      return
    }

    // Apply slot topology onto bound runners (BFS by saved entries).
    const applySimRunnerSlotsConfigEntry = (
      runnerId: string,
      entry: NonNullable<SimRunnerSlotsConfigJson['runners']>[string]
    ) => {
      const simGraphRunner = runnerIdToRunnerMap.get(runnerId)
      if (!simGraphRunner || !entry || typeof entry.slotBySlotName !== 'object') return

      for (const slotName in entry.slotBySlotName) {
        const slot = entry.slotBySlotName[slotName]
        if (!slot) continue

        const _slotDiagramId = slot.diagramId && typeof slot.diagramId === 'string'
          ? slot.diagramId.trim()
          : undefined
        if (_slotDiagramId && !diagramIdsSet.has(_slotDiagramId)) continue

        const _slotSimGraphRunnerId = slot.runnerId && typeof slot.runnerId === 'string'
          ? slot.runnerId.trim()
          : undefined
        if (_slotSimGraphRunnerId && !cfg.runners[_slotSimGraphRunnerId]) continue

        simGraphRunner.addGraphSlot(slotName, {
          diagramId: _slotDiagramId,
          diagramLocked: true,
          runnerId: _slotSimGraphRunnerId,
        })

        if (_slotSimGraphRunnerId) {
          if (_slotDiagramId) {
            ensureDiagramRunner(_slotSimGraphRunnerId, _slotDiagramId)
          }
          applySimRunnerSlotsConfigEntry(_slotSimGraphRunnerId, cfg.runners[_slotSimGraphRunnerId])
        }
      }
    }

    applySimRunnerSlotsConfigEntry(ROOT_RUNNER_ID, rootEntry)
    materializeSlotTree(ROOT_RUNNER_ID)
    bumpRunners()
  }

  /** Project IO: omit empty libraries so old/small projects stay lean. */
  const getProjectSimResources = (opts?: { includeClipPoses?: boolean }) => {
    const includeClipPoses = opts?.includeClipPoses === true
    const clipSetup =
      clipLibraryRef.value.entryCount > 0 ? clipLibraryToCompactJson(clipLibraryRef.value) : undefined
    
    const animDatabaseLibrary =
      animDbLibrary.value.size > 0
        ? animDatabaseLibraryToCompactJson(animDbLibrary.value)
        : undefined
    
    const rigLibraryJson = rigLibrary.value.size > 0 ? rigLibrary.value.toJson() : undefined
    
    const clipPoseLibraryJson = includeClipPoses
      ? getCachedClipPoseLibraryJson()
      : undefined
    
      const hasPoses = clipPoseLibrary.value.size > 0
    const runnerSlots = serializeRunnerSlots()
    if (
      clipSetup == null &&
      animDatabaseLibrary == null &&
      (rigLibraryJson == null || !(rigLibraryJson.entries?.length > 0)) &&
      !hasPoses &&
      runnerSlots == null
    ) {
      return null
    }
    return {
      clipSetup,
      animDatabaseLibrary,
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
      rigLibrary?: RigLibraryJson
      clipPoseLibrary?: ClipPoseLibraryJson
      runnerSlots?: SimRunnerSlotsConfigJson
    } | null
  ) => {
    clipLibraryRef.value.clear()
    if (resources?.clipSetup != null) {
      try {
        loadCompactClipLibraryJson(clipLibraryRef.value, resources.clipSetup, 'project')
      } catch (err) {
        console.warn('Failed to restore project clipSetup', err)
      }
    }

    animDbLibrary.value.clear()
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

    clipPoseLibrary.value.clear()
    if (resources?.clipPoseLibrary != null) {
      try {
        clipPoseLibrary.value.loadFromJson(resources.clipPoseLibrary)
      } catch (err) {
        console.warn('Failed to restore project clipPoseLibrary', err)
      }
    }

    rigLibrary.value.clear()
    if (resources?.rigLibrary != null) {
      try {
        rigLibrary.value.loadFromJson(resources.rigLibrary)
      } catch (err) {
        console.warn('Failed to restore project rigLibrary', err)
      }
    }

    // Drop dangling pose links (no migration from legacy setupEntryId).
    for (const e of clipLibraryRef.value.listEntries()) {
      if (e.poseSetId && !clipPoseLibrary.value.get(e.poseSetId)) {
        clipLibraryRef.value.setEntryPoseSetId(e.id, null)
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
   * @TODO move out from composable to store?
   * Pooled pose + rig for skeleton viewport (not reactive — call each frame).
   * - full: root runner sampleOut
   * - selected: chosen runner sampleOut (`selectedRunnerId`)
   * - atNode: Sample capture at selected handle (no fallback)
   */
  const getSkeletonViewPose = (
    source: 'full' | 'selected' | 'atNode',
    options: {
      /** Prefer open diagram for atNode capture search / fallback. */
      activeDiagramId?: string | null
      /** Runner Sample out when source is `selected`. */
      selectedRunnerId?: string | null
      captureHandleId?: string | null
    } = {}
  ): { pose: Pose; rig: RigEntry } | null => {
    const outputFromRunner = (runner: SimGraphRunner | null | undefined) => {
      if (!runner) return null
      const rig = runner.getActiveRig() ?? rigLibrary.value.getActive()
      const pose = runner.getSampledPose()
      return rig && pose ? { pose, rig } : null
    }

    const resolveRunner = (
      runnerId: string | null | undefined,
      diagramId: string | null | undefined,
    ) => {
      const runnerFromId = runnerId ? runnerIdToRunnerMap.get(runnerId) : null
      if (runnerFromId) {
        return runnerFromId
      }
      if (diagramId) {
        return findRunnerByDiagramId(diagramId)
      }
      return null
    }

    if (source === 'full') {
      return outputFromRunner(resolveRunner(ROOT_RUNNER_ID, null))
    }

    if (source === 'selected') {
      return outputFromRunner(resolveRunner(options.selectedRunnerId, options.activeDiagramId))
    }

    if (source === 'atNode') {
      if (!options.captureHandleId) {
        return null
      }

      const runner = resolveRunner(options.selectedRunnerId, options.activeDiagramId)
      if (!runner) {
        return null
      }

      const pose = runner.getCapturedPose(options.captureHandleId)
      const rig = runner.getActiveRig() ?? rigLibrary.value.getActive()
      if (!pose || !rig) {
        return null
      }
      return { pose, rig }
    }

    return null
  }

  // ------------------------------------------------------------
  // Effects
  // ------------------------------------------------------------

  watch(() => diagramIdsListRevisionRef.value, () => {
    rebind()
  }, { immediate: true })

  return {
    syncToDiagrams,
    syncToDiagram,
    active,
    playing: playingRef,
    speedRef,
    getPrimaryRunner,
    getRunner,
    getRootRunnerId,
    ensureSlotRunner: (parentId: string, slotName: string) => {
      const parent = runnerIdToRunnerMap.get(parentId)
      if (!parent) return null
      return ensureSlotRunner(parent, slotName)
    },
    listSlotRunners,
    listBoundRunnerTree,
    listBoundRunnerPaths,
    setSlotDiagramId,
    setRunnerDiagramId: ensureDiagramRunner,
    findRunnerByDiagramId,
    findRunnersByDiagramId,
    snapshot,
    snapshotsByRunner,
    runnersRev,
    snapshotForDiagram,
    snapshotForRunner,
    getSkeletonViewPose,
    allDiagramsDiscoveredComputed,
    discovered,
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

    board,
    getDraftBoard,
    listDraftBoardIds,
    draftBoardIdsRev,
    registerDraftBoard,
    unregisterDraftBoard,
    
    acquireExternalSimDriver,
    releaseExternalSimDriver,

    activate,
    deactivate,
    toggleActivation,
    
    play,
    pause,
    toggle,
    step,
    reset,
    update,
    setSpeed,

    fireExternal,
    fireAnimEvent,
    fireAnimEnd,

    rebind,
    dispose,
  }
}

