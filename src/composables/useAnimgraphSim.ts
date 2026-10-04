import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { MAIN_DIAGRAM_ID } from '../utils/graph/diagramTypes'
import {
  activeDiagramId,
  getRenderData,
  listDiagramIds,
  projectRef,
} from '../stores/graphProject'
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
  type SimGraphSlotHost,
} from '../utils/sim/SimGraphRunner'
import { SimInputBoard } from '../utils/sim/SimInputBoard'
import { collectDiscoveredInputs } from '../utils/sim/SimStateMachine'
import { emptySimSnapshot, type SimSnapshot } from '../utils/sim/simTypes'

function resolveRootDiagramId(ids: string[]): string | null {
  if (!ids.length) return null
  if (ids.includes(MAIN_DIAGRAM_ID)) return MAIN_DIAGRAM_ID
  return ids[0] ?? null
}

/** Case-insensitive diagram id lookup (GraphSlot.name ↔ project diagram id). */
function findDiagramIdBySlotName(ids: string[], slotName: string): string | null {
  const want = slotName.trim()
  if (!want || want === 'None') return null
  if (ids.includes(want)) return want
  const lower = want.toLowerCase()
  return ids.find((id) => id.toLowerCase() === lower) ?? null
}

export function useAnimgraphSim() {
  const clock = shallowRef(new SimClock())
  const board = shallowRef(new SimInputBoard())
  /** One runner per project diagram (HandleId-safe instance dyn). */
  const runners = new Map<string, SimGraphRunner>()
  const clipLibrary = shallowRef(new ClipLibrary())
  const animDbLibrary = shallowRef(new AnimDatabaseLibrary())
  /** Bump to refresh clip UI after library mutates in place. */
  const clipLibraryRevision = ref(0)
  const animDbRevision = ref(0)
  /** Per-diagram overlay snapshots from last publish. */
  const snapshotsByDiagram = shallowRef<Record<string, SimSnapshot>>({})
  // Shallow: publish replaces the whole object; avoid deep-walking nodes each frame.
  const snapshot = shallowRef<SimSnapshot>(emptySimSnapshot())
  const enabled = ref(false)
  const active = ref(false)
  const eventDraft = ref('')
  const featureDrafts = ref<Record<string, number>>({})
  const floatVarDrafts = ref<Record<string, number>>({})
  const boolVarDrafts = ref<Record<string, boolean>>({})
  const intVarDrafts = ref<Record<string, number>>({})
  /** AnimNode_TagValue data-flow tags */
  const tagValueDrafts = ref<Record<string, number>>({})
  /** SetAnimWrapperWeight mock: name → weight (active if >= 0.5) */
  const wrapperWeightDrafts = ref<Record<string, number>>({})

  let raf = 0
  let lastTs = 0
  /** Diagrams currently stepping via GraphSlot nest — cycle guard. */
  const nestStack: string[] = []

  const bumpClips = () => {
    clipLibraryRevision.value++
  }

  const bumpAnimDb = () => {
    animDbRevision.value++
  }

  const isWrapperActive = (name: string) => {
    const w = wrapperWeightDrafts.value[name]
    if (w !== undefined) return w >= SimInputBoard.WRAPPER_ACTIVE_THRESHOLD
    return board.value.isWrapperActive(name)
  }

  const ensureRunner = (diagramId: string): SimGraphRunner => {
    let r = runners.get(diagramId)
    if (!r) {
      r = new SimGraphRunner()
      runners.set(diagramId, r)
    }
    r.setClipLibrary(clipLibrary.value)
    r.setAnimDatabaseLibrary(animDbLibrary.value)
    return r
  }

  const publishActiveSnapshot = () => {
    const id = activeDiagramId.value
    if (id && snapshotsByDiagram.value[id]) {
      snapshot.value = snapshotsByDiagram.value[id]!
      return
    }
    // No snap for this diagram this frame (e.g. GraphSlot not on active path).
    snapshot.value = emptySimSnapshot()
    snapshot.value.time = clock.value.time
    snapshot.value.playing = clock.value.playing
    snapshot.value.speed = clock.value.speed
  }

  const discovered = computed(() => {
    void projectRef.value
    void clipLibraryRevision.value
    const features: { feature: string; property: string }[] = []
    const floatVars: string[] = []
    const boolVars: string[] = []
    const intVars: string[] = []
    const wrappers: string[] = []
    const events: string[] = []
    const tags: string[] = []
    const featSeen = new Set<string>()
    const mergeUnique = (into: string[], seen: Set<string>, names: string[]) => {
      for (const n of names) {
        const k = n.toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        into.push(n)
      }
    }
    const floatSeen = new Set<string>()
    const boolSeen = new Set<string>()
    const intSeen = new Set<string>()
    const wrapSeen = new Set<string>()
    const eventSeen = new Set<string>()
    const tagSeen = new Set<string>()

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
      mergeUnique(floatVars, floatSeen, fromGraph.floatVars)
      mergeUnique(boolVars, boolSeen, fromGraph.boolVars)
      mergeUnique(intVars, intSeen, fromGraph.intVars)
      mergeUnique(wrappers, wrapSeen, fromGraph.wrappers)
      mergeUnique(events, eventSeen, fromGraph.events)
      mergeUnique(tags, tagSeen, fromGraph.tags)
    }

    const fromClips = clipLibrary.value.eventNames()
    const fromSetupWrappers = clipLibrary.value.wrapperNames()
    mergeUnique(events, eventSeen, fromClips)
    mergeUnique(wrappers, wrapSeen, fromSetupWrappers)

    features.sort((a, b) =>
      `${a.feature}.${a.property}`.localeCompare(`${b.feature}.${b.property}`)
    )
    floatVars.sort((a, b) => a.localeCompare(b))
    boolVars.sort((a, b) => a.localeCompare(b))
    intVars.sort((a, b) => a.localeCompare(b))
    wrappers.sort((a, b) => a.localeCompare(b))
    events.sort((a, b) => a.localeCompare(b))
    tags.sort((a, b) => a.localeCompare(b))

    return { features, floatVars, boolVars, intVars, wrappers, events, tags }
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

  const featureKey = (feature: string, property: string) => `${feature}\0${property}`

  const applyDraftsToBoard = () => {
    for (const [key, val] of Object.entries(featureDrafts.value)) {
      const sep = key.indexOf('\0')
      if (sep < 0) continue
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.setFeature(key.slice(0, sep), key.slice(sep + 1), n)
    }
    for (const [name, val] of Object.entries(floatVarDrafts.value)) {
      const n = Number(val)
      if (!Number.isFinite(n)) continue
      board.value.floatVars.set(name, n)
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
  }

  const makeSlotHost = (
    snaps: Record<string, SimSnapshot>,
    stepped: Set<string>,
    dt: number
  ): SimGraphSlotHost => ({
    stepNested(slotName, parentPoseUpdate) {
      const ids = listDiagramIds.value
      const diagramId = findDiagramIdBySlotName(ids, slotName)
      if (!diagramId) return null
      if (nestStack.includes(diagramId)) return null
      if (!getRenderData(diagramId)) return null
      const runner = ensureRunner(diagramId)
      nestStack.push(diagramId)
      try {
        const snap = runner.step(
          dt,
          board.value,
          clock.value.time,
          clock.value.playing,
          clock.value.speed,
          {
            endBoardFrame: false,
            slotHost: makeSlotHost(snaps, stepped, dt),
            parentPoseUpdate,
          }
        )
        snaps[diagramId] = snap
        stepped.add(diagramId)
        return { diagramId, snap }
      } finally {
        nestStack.pop()
      }
    },
  })

  const stepDiagram = (
    diagramId: string,
    dt: number,
    slotHost: SimGraphSlotHost,
    endBoardFrame: boolean
  ): SimSnapshot => {
    const runner = ensureRunner(diagramId)
    nestStack.push(diagramId)
    try {
      return runner.step(dt, board.value, clock.value.time, clock.value.playing, clock.value.speed, {
        endBoardFrame,
        slotHost,
      })
    } finally {
      nestStack.pop()
    }
  }

  const publish = (dt: number) => {
    applyDraftsToBoard()
    const snaps: Record<string, SimSnapshot> = {}
    const stepped = new Set<string>()
    const slotHost = makeSlotHost(snaps, stepped, dt)
    const rootId = resolveRootDiagramId(listDiagramIds.value)

    // Only root Update; slotted diagrams tick solely when GraphSlot is on the active path.
    if (rootId) {
      snaps[rootId] = stepDiagram(rootId, dt, slotHost, false)
      stepped.add(rootId)
    }

    board.value.endFrame()
    snapshotsByDiagram.value = snaps
    publishActiveSnapshot()
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
    if (dt > 0) publish(dt)
  }

  const syncLoop = () => {
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
    const keep = new Set(ids)
    for (const id of [...runners.keys()]) {
      if (!keep.has(id)) runners.delete(id)
    }
    for (const id of ids) {
      const data = getRenderData(id)
      const runner = ensureRunner(id)
      runner.bind(data)
      runner.setClipLibrary(clipLibrary.value)
      runner.setAnimDatabaseLibrary(animDbLibrary.value)
    }
    board.value.clearAll()
    clock.value.reset()
    const drafts: Record<string, number> = {}
    for (const f of discovered.value.features) {
      drafts[featureKey(f.feature, f.property)] = 0
    }
    featureDrafts.value = drafts
    floatVarDrafts.value = {}
    boolVarDrafts.value = {}
    intVarDrafts.value = {}
    tagValueDrafts.value = {}
    wrapperWeightDrafts.value = {}
    snapshotsByDiagram.value = {}
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

  watch(activeDiagramId, () => {
    publishActiveSnapshot()
  })

  onUnmounted(() => {
    stopLoop()
  })

  const play = () => {
    clock.value.play()
    publish(0)
    syncLoop()
  }
  const pause = () => {
    clock.value.pause()
    publish(0)
    syncLoop()
  }
  const toggle = () => {
    clock.value.toggle()
    publish(0)
    syncLoop()
  }
  const step = () => {
    const dt = clock.value.step()
    publish(dt)
  }
  const reset = () => {
    clock.value.reset()
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
    syncLoop()
  }
  const toggleActive = () => {
    if (active.value) deactivate()
    else activate()
  }

  const setSpeed = (s: number) => {
    clock.value.setSpeed(s)
    const nextSnaps: Record<string, SimSnapshot> = { ...snapshotsByDiagram.value }
    for (const [id, snap] of Object.entries(nextSnaps)) {
      nextSnaps[id] = {
        ...snap,
        speed: clock.value.speed,
        nodeDelta: snap.nodeDelta ? { changes: {}, removed: [] } : null,
      }
    }
    snapshotsByDiagram.value = nextSnaps
    publishActiveSnapshot()
    snapshot.value = {
      ...snapshot.value,
      speed: clock.value.speed,
      nodeDelta: snapshot.value.nodeDelta ? { changes: {}, removed: [] } : null,
    }
  }

  const fireExternal = (name?: string) => {
    const n = (name ?? eventDraft.value).trim()
    if (!n) return
    board.value.fireExternalEvent(n)
    publish(0)
  }

  const fireAnimEvent = (name?: string) => {
    const n = (name ?? eventDraft.value).trim()
    if (!n) return
    board.value.injectAnimEventNow(n)
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
    publish(0)
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
    bumpClips()
    publish(0)
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
    if (!clipLibrary.value.removeEntry(id)) return
    bumpClips()
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

  const isClipActive = (name: string): boolean => getClip(name) !== undefined

  const listClipSets = (name: string): ClipSetMembership[] => {
    void clipLibraryRevision.value
    void wrapperWeightDrafts.value
    return clipLibrary.value.entriesContainingClip(name, isWrapperActive)
  }

  const exportCompactClipLibrary = () => clipLibraryToCompactJson(clipLibrary.value)

  const exportCompactAnimDatabaseLibrary = () =>
    animDatabaseLibraryToCompactJson(animDbLibrary.value)

  /** Project IO: omit empty libraries so old/small projects stay lean. */
  const getProjectSimResources = () => {
    const clipSetup =
      clipLibrary.value.entryCount > 0 ? clipLibraryToCompactJson(clipLibrary.value) : undefined
    const animDatabaseLibrary =
      animDbLibrary.value.size > 0
        ? animDatabaseLibraryToCompactJson(animDbLibrary.value)
        : undefined
    if (clipSetup == null && animDatabaseLibrary == null) return null
    return { clipSetup, animDatabaseLibrary }
  }

  const applyProjectSimResources = (
    resources: {
      clipSetup?: AnimClipSetupJson
      animDatabaseLibrary?: AnimDatabaseLibraryJson
    } | null
  ) => {
    clipLibrary.value.clear()
    animDbLibrary.value.clear()
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
    bumpClips()
    bumpAnimDb()
    // Keep board feature drafts; re-publish so runners see new libraries.
    for (const runner of runners.values()) {
      runner.setClipLibrary(clipLibrary.value)
      runner.setAnimDatabaseLibrary(animDbLibrary.value)
    }
    publish(0)
  }

  const snapshotForDiagram = (diagramId: string | null | undefined): SimSnapshot | undefined => {
    if (!diagramId) return undefined
    return snapshotsByDiagram.value[diagramId]
  }

  return {
    enabled,
    active,
    snapshot,
    snapshotsByDiagram,
    snapshotForDiagram,
    discovered,
    eventDraft,
    featureDrafts,
    floatVarDrafts,
    boolVarDrafts,
    intVarDrafts,
    tagValueDrafts,
    wrapperWeightDrafts,
    clipStats,
    clipNames,
    setupEntries,
    animDbStats,
    animDatabases,
    draftFeatureValue,
    getClip,
    lookupClip,
    isClipActive,
    listClipSets,
    loadAnimsetJson,
    loadClipLibraryJson,
    clearClipLibrary,
    loadAnimDatabaseJson,
    loadAnimDatabaseLibraryJson,
    clearAnimDatabaseLibrary,
    removeAnimDatabase,
    updateSetupEntry,
    removeSetupEntry,
    exportCompactClipLibrary,
    exportCompactAnimDatabaseLibrary,
    getProjectSimResources,
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
    setBoolVar,
    setIntVar,
    setTagValue,
    setWrapperWeight,
    setFeature,
    rebind,
  }
}
