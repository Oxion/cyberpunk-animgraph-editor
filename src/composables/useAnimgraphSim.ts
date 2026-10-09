import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { MAIN_DIAGRAM_ID } from '../utils/graph/diagramTypes'
import {
  activeDiagramId,
  getRenderData,
  listDiagramIds,
  mainDiagramId,
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
import {
  IDENTITY_QUAT_VEC4,
  SimInputBoard,
  type SimVec4,
} from '../utils/sim/SimInputBoard'
import { ZERO_VEC4 } from '../utils/sim/evalAnimMathExpressionVector'
import { collectDiscoveredInputs } from '../utils/sim/SimStateMachine'
import { emptySimSnapshot, type SimSnapshot } from '../utils/sim/simTypes'
import { isSimSampleLogEnabled } from '../utils/sim/simSampleLog'
import { RigLibrary, type RigLibraryJson, type RigEntryView } from '../utils/sim/rigResource'
import { ClipPoseLibrary, type ClipPoseSetView } from '../utils/sim/clipPoseLibrary'

function resolveRootDiagramId(ids: string[]): string | null {
  if (!ids.length) return null
  const mainId = mainDiagramId.value
  if (mainId && ids.includes(mainId)) return mainId
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
  const rigLibrary = shallowRef(new RigLibrary())
  const clipPoseLibrary = shallowRef(new ClipPoseLibrary())
  /** Bump to refresh clip UI after library mutates in place. */
  const clipLibraryRevision = ref(0)
  const animDbRevision = ref(0)
  const rigRevision = ref(0)
  const clipPoseRevision = ref(0)
  /** Per-diagram overlay snapshots from last publish. */
  const snapshotsByDiagram = shallowRef<Record<string, SimSnapshot>>({})
  // Shallow: publish replaces the whole object; avoid deep-walking nodes each frame.
  const snapshot = shallowRef<SimSnapshot>(emptySimSnapshot())
  const enabled = ref(false)
  const active = ref(false)
  const eventDraft = ref('')
  const featureDrafts = ref<Record<string, number>>({})
  /** Vector4 AnimFeature drafts: feature\\0property → {x,y,z,w} */
  const vectorFeatureDrafts = ref<Record<string, SimVec4>>({})
  const quatFeatureDrafts = ref<Record<string, SimVec4>>({})
  /** Bool AnimFeature drafts: feature\\0property → boolean */
  const boolFeatureDrafts = ref<Record<string, boolean>>({})
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

  const bumpRigs = () => {
    rigRevision.value++
  }

  const bumpClipPose = () => {
    clipPoseRevision.value++
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

  const ensureRunner = (diagramId: string): SimGraphRunner => {
    let r = runners.get(diagramId)
    if (!r) {
      r = new SimGraphRunner()
      runners.set(diagramId, r)
    }
    r.diagramId = diagramId
    r.setClipLibrary(clipLibrary.value)
    r.setAnimDatabaseLibrary(animDbLibrary.value)
    r.setClipPoseLibrary(clipPoseLibrary.value)
    r.setActiveRig(rigLibrary.value.getActive())
    r.sampleWarningsEnabled = sampleWarningsEnabled.value
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
    void entityTagDrafts.value
    const features: { feature: string; property: string }[] = []
    const vectorFeatures: { feature: string; property: string }[] = []
    const quatFeatures: { feature: string; property: string }[] = []
    const boolFeatures: { feature: string; property: string }[] = []
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
  let lastNestedPoseBySlot = new Map<string, import('../utils/sim/pose').Pose>()

  const makeSlotHost = (
    snaps: Record<string, SimSnapshot>,
    stepped: Set<string>,
    dt: number,
    nestedPoseBySlot: Map<string, import('../utils/sim/pose').Pose>
  ): SimGraphSlotHost => ({
    stepNested(slotName, parentPoseUpdate, parentPoseSample) {
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
            slotHost: makeSlotHost(snaps, stepped, dt, nestedPoseBySlot),
            parentPoseUpdate,
            parentPoseSample,
          }
        )
        snaps[diagramId] = snap
        stepped.add(diagramId)
        const pose = runner.getSampledPose()
        if (pose) {
          nestedPoseBySlot.set(slotName, pose)
          const lower = slotName.trim().toLowerCase()
          if (lower && lower !== slotName) nestedPoseBySlot.set(lower, pose)
        }
        return { diagramId, snap }
      } finally {
        nestStack.pop()
      }
    },
    getNestedPose(slotName) {
      const want = slotName.trim()
      if (!want || want === 'None') return null
      const cached =
        nestedPoseBySlot.get(want) ?? nestedPoseBySlot.get(want.toLowerCase())
      if (cached) return cached
      const ids = listDiagramIds.value
      const diagramId = findDiagramIdBySlotName(ids, want)
      if (!diagramId) return null
      return runners.get(diagramId)?.getSampledPose() ?? null
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
    // Overlay applies undefined when inactive — skip step so callers (drafts, capture,
    // resource loads) do not force a full diagram walk via snapshot watch.
    if (!active.value) return
    applyDraftsToBoard()
    const snaps: Record<string, SimSnapshot> = {}
    const stepped = new Set<string>()
    lastNestedPoseBySlot = new Map()
    const slotHost = makeSlotHost(snaps, stepped, dt, lastNestedPoseBySlot)
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
      runner.setClipPoseLibrary(clipPoseLibrary.value)
      runner.setActiveRig(rigLibrary.value.getActive())
    }
    board.value.clearAll()
    clock.value.reset()
    const drafts: Record<string, number> = {}
    for (const f of discovered.value.features) {
      drafts[featureKey(f.feature, f.property)] = 0
    }
    featureDrafts.value = drafts
    const vecDrafts: Record<string, SimVec4> = {}
    for (const f of discovered.value.vectorFeatures) {
      vecDrafts[featureKey(f.feature, f.property)] = { ...ZERO_VEC4 }
    }
    vectorFeatureDrafts.value = vecDrafts
    const quatDrafts: Record<string, SimVec4> = {}
    for (const f of discovered.value.quatFeatures) {
      quatDrafts[featureKey(f.feature, f.property)] = { ...IDENTITY_QUAT_VEC4 }
    }
    quatFeatureDrafts.value = quatDrafts
    const boolDrafts: Record<string, boolean> = {}
    for (const f of discovered.value.boolFeatures) {
      boolDrafts[featureKey(f.feature, f.property)] = false
    }
    boolFeatureDrafts.value = boolDrafts
    floatVarDrafts.value = {}
    vectorVarDrafts.value = {}
    quatVarDrafts.value = {}
    boolVarDrafts.value = {}
    intVarDrafts.value = {}
    tagValueDrafts.value = {}
    // entityTagDrafts are project resources — kept across rebind (like clip/anim DB).
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
    publish(0)
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
    publish(0)
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
    publish(0)
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

  const setPoseInspectBones = (names: string[]) => {
    for (const runner of runners.values()) {
      runner.poseInspectBones = names.map((n) => n.trim()).filter(Boolean)
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

  const setStackCaptureHandleIds = (ids: string[]) => {
    const cleaned = ids.map((id) => id.trim()).filter(Boolean)
    for (const runner of runners.values()) {
      // Only capture on diagrams that own the handle (avoid ranged looking for player_base ids).
      runner.setStackCaptureHandleIds(cleaned.filter((id) => runner.hasHandle(id)))
    }
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
    const entityTags =
      Object.keys(entityTagDrafts.value).length > 0
        ? { ...entityTagDrafts.value }
        : undefined
    const rigLibraryJson =
      rigLibrary.value.size > 0 ? rigLibrary.value.toJson() : undefined
    if (
      clipSetup == null &&
      animDatabaseLibrary == null &&
      entityTags == null &&
      (rigLibraryJson == null || !(rigLibraryJson.entries?.length > 0))
    ) {
      return null
    }
    return { clipSetup, animDatabaseLibrary, entityTags, rigLibrary: rigLibraryJson }
  }

  const applyProjectSimResources = (
    resources: {
      clipSetup?: AnimClipSetupJson
      animDatabaseLibrary?: AnimDatabaseLibraryJson
      entityTags?: Record<string, boolean>
      rigLibrary?: RigLibraryJson
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
    bumpClips()
    bumpAnimDb()
    bumpRigs()
    bumpClipPose()
    for (const runner of runners.values()) {
      runner.setClipLibrary(clipLibrary.value)
      runner.setAnimDatabaseLibrary(animDbLibrary.value)
      runner.setClipPoseLibrary(clipPoseLibrary.value)
      runner.setActiveRig(rigLibrary.value.getActive())
      runner.invalidateStaticSwitches()
    }
    publish(0)
  }

  const snapshotForDiagram = (diagramId: string | null | undefined): SimSnapshot | undefined => {
    if (!diagramId) return undefined
    return snapshotsByDiagram.value[diagramId]
  }

  /**
   * Pooled pose + rig for skeleton viewport (not reactive — call each frame).
   * - full: root diagram sampleOut
   * - active: open diagram sampleOut
   * - atNode: Sample capture at selected handle (fallback → active/full)
   */
  const getSkeletonViewPose = (
    source: 'full' | 'active' | 'atNode',
    options?: {
      activeDiagramId?: string | null
      captureHandleId?: string | null
    }
  ): { pose: import('../utils/sim/pose').Pose; rig: import('../utils/sim/rigResource').RigEntry } | null => {
    const rootId = resolveRootDiagramId(listDiagramIds.value)
    const activeId =
      options?.activeDiagramId ?? activeDiagramId.value ?? rootId
    const pick = (diagramId: string | null | undefined) => {
      if (!diagramId) return null
      const runner = runners.get(diagramId) ?? ensureRunner(diagramId)
      const rig = runner.getActiveRig() ?? rigLibrary.value.getActive()
      const pose = runner.getSampledPose()
      if (!rig || !pose) return null
      return { pose, rig }
    }

    if (source === 'full') return pick(rootId)

    if (source === 'active') return pick(activeId)

    // atNode
    const hid = options?.captureHandleId?.trim()
    if (hid) {
      const tryCapture = (diagramId: string | null | undefined) => {
        if (!diagramId) return null
        const runner = runners.get(diagramId)
        if (!runner) return null
        const pose = runner.getCapturedPose(hid)
        const rig = runner.getActiveRig() ?? rigLibrary.value.getActive()
        if (!pose || !rig) return null
        return { pose, rig }
      }
      const fromActive = tryCapture(activeId)
      if (fromActive) {
        if (isSimSampleLogEnabled()) {
          console.log(`[sim-sample] viewport atNode=${hid} source=capture diagram=${activeId}`)
        }
        return fromActive
      }
      for (const id of runners.keys()) {
        const hit = tryCapture(id)
        if (hit) {
          if (isSimSampleLogEnabled()) {
            console.log(`[sim-sample] viewport atNode=${hid} source=capture diagram=${id}`)
          }
          return hit
        }
      }
      if (isSimSampleLogEnabled()) {
        console.log(
          `[sim-sample] viewport atNode=${hid} source=FALLBACK-sampleOut active=${activeId} root=${rootId}`
        )
      }
    }
    return pick(activeId) ?? pick(rootId)
  }

  return {
    enabled,
    active,
    snapshot,
    snapshotsByDiagram,
    snapshotForDiagram,
    getSkeletonViewPose,
    discovered,
    eventDraft,
    featureDrafts,
    vectorFeatureDrafts,
    quatFeatureDrafts,
    boolFeatureDrafts,
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
    getClip,
    lookupClip,
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
    setPoseInspectBones,
    sampleWarningsEnabled,
    setSampleWarningsEnabled,
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
    setVectorFeature,
    setVectorFeatureAxis,
    setQuatFeature,
    setQuatFeatureAxis,
    rebind,
  }
}
