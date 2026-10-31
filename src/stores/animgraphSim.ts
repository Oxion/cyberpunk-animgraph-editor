/**
 * Singleton animgraph simulation runtime (clock, runners, board, libraries).
 * Created once for the app; UI (SimPanel, windows) imports from here.
 * Do not import concrete HandleDef instances here (circular with their resolvers).
 */
import { computed, ComputedRef, Ref, ref, shallowRef, triggerRef, watch } from 'vue'
import { SimExternalSimDriver, useAnimgraphSim } from '../composables/useAnimgraphSim'
import { InstanceStore } from '../utils/InstanceStore'
import {
  SIM_DRIVER_DEFAULT_ID,
  type SimDriver,
  type SimDriverHandle,
  type SimDriverHandleCreateProps,
  type SimDriversProjectJson,
} from '../utils/sim/simDriver'
import type { SimDriverHandleDef } from '../utils/sim/simDriverHandleDef'
import {
  getSimDriverHandleDef,
  listSimDriverHandleDefs,
} from '../utils/sim/simDriverHandleRegistry'
import { bindWorkspotHubFeatureApi } from '../utils/sim/simWorkspotHubDriverDef'
import { markProjectDirty } from './projectDirty'
import { getRenderData, listDiagramIds, mainDiagramId, projectRef } from './graphProject'
import { DraftBoard } from '@/composables/sim/DraftBoard'
import { SimServiceEvent, SimVec4 } from '@/utils/sim'
import { makeFeatureKey } from '@/composables/sim/features'
import { mergeUniqueStrings } from '@/utils/merge'
import {
  liveBridgeStart,
  liveBridgeStop,
  onLiveBridgeLine,
  onLiveBridgeStatus,
} from '@/api/liveBridgeApi'
import { getLiveBridgeSettings } from '@/stores/liveBridgeSettings'

const animgraphSim = useAnimgraphSim({
  listDiagramIds: () => listDiagramIds.value,
  getRootDiagramId: () => mainDiagramId.value,
  getDiagramDataById: (diagramId) => getRenderData(diagramId) ?? undefined,
})
export const sim = animgraphSim

watch(() => projectRef.value, () => {
  sim.syncToDiagrams()
}, { immediate: true })

export const DEFAULT_DRAFT_BOARD_ID = 'default'
export const draftBoard = new DraftBoard(DEFAULT_DRAFT_BOARD_ID)
sim.registerDraftBoard(draftBoard, 0)

export const eventNameDraftRef = ref('')
export const eventValueDraftRef = ref(0)

// #region Additional entity tags

const additionalEntityTagNamesSetRef = shallowRef<Set<string>>(new Set())
export const addEntityTagName = (tagName: string) => {
  additionalEntityTagNamesSetRef.value.add(tagName)
  triggerRef(additionalEntityTagNamesSetRef)
}
export const removeEntityTagName = (tagName: string) => {
  additionalEntityTagNamesSetRef.value.delete(tagName)
  triggerRef(additionalEntityTagNamesSetRef)
}

const serializeAdditionalEntityTagNames = () => {
  if (!additionalEntityTagNamesSetRef.value.size) {
    return
  }

  const entityTagByKey = draftBoard.entityTagByKeyRef.value
  const result = {} as Record<string, boolean>
  for (const entityTagName of additionalEntityTagNamesSetRef.value.values()) {
    result[entityTagName] = entityTagByKey[entityTagName] ?? false
  }
  return result
}

const applySerializedEntityTags = (entityTags: Record<string, boolean> | null | undefined) => {
  if (!entityTags) return
  for (const [entityTagName, value] of Object.entries(entityTags)) {
    addEntityTagName(entityTagName)
    draftBoard.setEntityTagValue(entityTagName, value)
  }
}

// #endregion

// #region discover

const discoveredEntityTagsInfoComputed = computed(() => {
  const additionalEntityTagNamesSet = additionalEntityTagNamesSetRef.value

  const entityTagNames = Array.from(sim.allDiagramsDiscoveredComputed.value.entityTagNamesSet)
  const entityTagNamesSet = new Set(entityTagNames)

  mergeUniqueStrings(entityTagNamesSet, Array.from(additionalEntityTagNamesSet.values()), entityTagNames)

  entityTagNames.sort((a, b) => a.localeCompare(b))

  return {
    entityTagNamesSet,
    entityTagNames,
  }
})

export const discovered = {
  entityTagsInfoComputed: discoveredEntityTagsInfoComputed,
}

// #endregion

// #region Driver store

bindWorkspotHubFeatureApi(() => ({
  getFeature: (feature: string, property: string) => draftBoard.numericFeatureByKeyRef.value[makeFeatureKey(feature, property)],
  getBoolFeature: (feature: string, property: string) => draftBoard.booleanFeatureByKeyRef.value[makeFeatureKey(feature, property)],
  getStringFeature: (feature: string, property: string) => draftBoard.stringFeatureByKeyRef.value[makeFeatureKey(feature, property)],
  getVectorFeature: (feature: string, property: string) => draftBoard.vectorFeatureByKeyRef.value[makeFeatureKey(feature, property)],
  getQuatFeature: (feature: string, property: string) => draftBoard.quatFeatureByKeyRef.value[makeFeatureKey(feature, property)],
  setFeature: (feature: string, property: string, value: number) => draftBoard.setNumericFeatureValue(feature, property, value),
  setBoolFeature: (feature: string, property: string, value: boolean) => draftBoard.setBooleanFeatureValue(feature, property, value),
  setStringFeature: (feature: string, property: string, value: string) => draftBoard.setStringFeatureValue(feature, property, value),
  setVectorFeature: (feature: string, property: string, value: SimVec4) => draftBoard.setVectorFeatureValue(feature, property, value),
  setQuatFeature: (feature: string, property: string, value: SimVec4) => draftBoard.setQuatFeatureValue(feature, property, value),
  withBatch(fn: () => void): void {
    fn()
    sim.update()
  },
}))

// ── Driver store (InstanceStore keyed by SimDriverHandleDef) ─────────────────

const simDriverHandlesStore = new InstanceStore()
export const simDriversRev = ref(0)

function bumpDriversStructural(dirty = true) {
  simDriversRev.value++
  if (dirty) markProjectDirty()
}

function bumpDriverUi(dirty = true) {
  if (dirty) markProjectDirty()
}

function handleCreateProps<TProps>(
  id: string,
  props?: TProps
): SimDriverHandleCreateProps<TProps> {
  return {
    id,
    onTouch: () => bumpDriverUi(true),
    driverProps: props as TProps,
  }
}

export function ensureSimDriver<TDriver extends SimDriver, TProps>(
  handleDef: SimDriverHandleDef<TDriver, TProps>,
  id: string,
  props?: TProps,
  opts?: { silent?: boolean }
): SimDriverHandle<TDriver> {
  const existingHandle = simDriverHandlesStore.get(handleDef, id)
  if (existingHandle) return existingHandle

  const handle = handleDef.create(handleCreateProps(id, props))
  simDriverHandlesStore.set(handleDef, id, handle)
  handleDef.attach(handle)
  bumpDriversStructural(!opts?.silent)

  return handle
}

export function ensureDefaultSimDriver<TDriver extends SimDriver, TProps>(
  handleDef: SimDriverHandleDef<TDriver, TProps>,
  props?: TProps,
  opts?: { silent?: boolean }
): SimDriverHandle<TDriver> {
  return ensureSimDriver(handleDef, SIM_DRIVER_DEFAULT_ID, props, opts)
}

export function getSimDriverHandle<TDriver extends SimDriver, TProps>(
  handleDef: SimDriverHandleDef<TDriver, TProps>,
  id: string = SIM_DRIVER_DEFAULT_ID
): SimDriverHandle<TDriver> | undefined {
  return simDriverHandlesStore.get(handleDef, id)
}

export function deleteSimDriverHandle<TDriver extends SimDriver, TProps>(
  handleDef: SimDriverHandleDef<TDriver, TProps>,
  id: string
): void {
  const h = simDriverHandlesStore.get(handleDef, id)
  if (!h) return
  h.dispose()
  simDriverHandlesStore.delete(handleDef, id)
  bumpDriversStructural(true)
}

export function listSimDriverHandles<TDriver extends SimDriver, TProps>(
  handleDef: SimDriverHandleDef<TDriver, TProps>
): SimDriverHandle<TDriver>[] {
  const bucket = simDriverHandlesStore.bucket(handleDef)
  if (!bucket) return []
  return [...bucket.values()]
}

/** Re-resolve attach ctx for every handleDef that has a resolver (runners change). */
export function syncSimDriverAttachments(): void {
  for (const handleDef of listSimDriverHandleDefs()) {
    if (!handleDef.resolveAttachCtx) continue
    const bucket = simDriverHandlesStore.bucket(handleDef)
    if (!bucket) continue
    for (const handle of bucket.values()) {
      handleDef.attach(handle)
    }
  }
}

function disposeAllSimDrivers(): void {
  for (const handleDef of listSimDriverHandleDefs()) {
    const bucket = simDriverHandlesStore.bucket(handleDef)
    if (!bucket) continue
    for (const handle of bucket.values()) handle.dispose()
  }
  simDriverHandlesStore.clear()
  bumpDriversStructural(false)
}

export function exportSimDrivers(): SimDriversProjectJson | undefined {
  const instances: SimDriversProjectJson['instances'] = []
  for (const handleDef of listSimDriverHandleDefs()) {
    const bucket = simDriverHandlesStore.bucket(handleDef)
    if (!bucket) continue
    const { driverDef } = handleDef
    for (const handle of bucket.values()) {
      instances.push({
        driverDefId: driverDef.id,
        id: handle.id,
        runnerId: handle.runnerId,
        attached: !!handle.runnerId || handle.attached,
        state: driverDef.serialize(handle.driver),
      })
    }
  }
  if (instances.length === 0) return undefined
  return { version: 1, instances }
}

export function applySimDrivers(
  json: SimDriversProjectJson | null | undefined
): void {
  disposeAllSimDrivers()

  if (!json?.instances?.length) {
    bumpDriversStructural(false)
    return
  }

  for (const inst of json.instances) {
    const handleDef = getSimDriverHandleDef(inst.driverDefId)
    if (!handleDef) {
      console.warn(`[simDrivers] unknown driverDefId=${inst.driverDefId}`)
      continue
    }

    let handle: SimDriverHandle
    try {
      handle = handleDef.restore(handleCreateProps(inst.id), inst.state)
    } catch (err) {
      console.warn(`[simDrivers] restore failed driverDefId=${inst.driverDefId}`, err)
      continue
    }
    simDriverHandlesStore.set(handleDef, inst.id, handle)

    handleDef.attach(handle)
  }
  syncSimDriverAttachments()
  bumpDriversStructural(false)
  bumpDriverUi(false)
}

watch(sim.runnersRev, () => {
  syncSimDriverAttachments()
})

export function simGetProjectSimResources(opts?: { includeClipPoses?: boolean }) {
  const base = sim.getProjectSimResources(opts)
  const simDriversJson = exportSimDrivers()
  const serializedEntityTags = serializeAdditionalEntityTagNames()
  if (base == null && simDriversJson == null && serializedEntityTags == null) return null
  return {
    ...(base ?? {}),
    entityTags: serializedEntityTags,
    simDrivers: simDriversJson,
  }
}

export function simApplyProjectSimResources(
  resources: Parameters<typeof sim.applyProjectSimResources>[0] & {
    simDrivers?: SimDriversProjectJson | null
    entityTags?: Record<string, boolean> | null
  } | null
) {
  sim.applyProjectSimResources(resources)
  applySerializedEntityTags(resources?.entityTags)
  applySimDrivers(resources?.simDrivers)
}

export function disposeAnimgraphSim() {
  disposeAllSimDrivers()
  sim.dispose()
}

/** Bump structural rev when a concrete HandleDef user mutates attach state. */
export function bumpSimDriversStructural(dirty = true): void {
  bumpDriversStructural(dirty)
}

// #endregion

// #region Live Bridge

type LiveTyped = { type?: string; value?: unknown }
type LiveVec = { x?: number; y?: number; z?: number; w?: number }

export type LiveBridgeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

const asSimVec4 = (v: unknown, fallbackW = 0): SimVec4 => {
  if (!v || typeof v !== 'object') return { x: 0, y: 0, z: 0, w: fallbackW }
  const o = v as LiveVec
  return {
    x: Number.isFinite(o.x) ? Number(o.x) : 0,
    y: Number.isFinite(o.y) ? Number(o.y) : 0,
    z: Number.isFinite(o.z) ? Number(o.z) : 0,
    w: Number.isFinite(o.w) ? Number(o.w) : fallbackW,
  }
}

const LIVE_BRIDGE_DRAFT_BOARD_PRIORITY = 1
const LIVE_BRIDGE_DRAFT_BOARD_ID = 'live-bridge'
const liveBridgeDraftBoard = new DraftBoard(LIVE_BRIDGE_DRAFT_BOARD_ID)

const liveBridgeConnectionStatusRef = ref<LiveBridgeConnectionStatus>('disconnected')
let liveBridgeLineSub: (() => void) | undefined
let liveBridgeStatusSub: (() => void) | undefined

const liveBridgeExternalSimDriverRef = ref<SimExternalSimDriver | undefined>(undefined)
const liveBridgeActiveComputed = computed(() => {
  return !!liveBridgeExternalSimDriverRef.value
})

/** Draft-only — no board write / publish; next sim tick picks up via applyDraftsToBoard. */
const applyLiveBridgeLiveTypedFeature = (feature: string, property: string, typed: LiveTyped) => {
  if (!feature || !property) return

  const type = String(typed.type ?? '').trim()
  if (!type) return
  
  const value = typed.value
  switch (type) {
    case 'bool':
      liveBridgeDraftBoard.setBooleanFeatureValue(feature, property, value === true)
      break
    case 'cname':
    case 'string':
      liveBridgeDraftBoard.setStringFeatureValue(feature, property, String(value ?? ''))
      break
    case 'vector':
      liveBridgeDraftBoard.setVectorFeatureValue(feature, property, asSimVec4(value, 0))
      break
    case 'quat':
      liveBridgeDraftBoard.setQuatFeatureValue(feature, property, asSimVec4(value, 1))
      break
    case 'int':
    case 'float':
      const n = Number(value) || 0
      if (!Number.isFinite(n)) return
      liveBridgeDraftBoard.setNumericFeatureValue(feature, property, n)
      break
  }
}

const applyLiveBridgeLiveTypedVar = (varName: string, typed: LiveTyped) => {
  const _varName = String(varName ?? '').trim()
  if (!_varName) return

  const type = String(typed.type ?? '').trim()
  if (!type) return

  const value = typed.value
  switch (type) {
    case 'float':
      const number = Number(value) || 0
      if (!Number.isFinite(number)) return
      liveBridgeDraftBoard.setFloatVarValue(_varName, number)
      break
    case 'int':
      const int = Math.round(Number(value) || 0)
      if (!Number.isFinite(int)) return
      liveBridgeDraftBoard.setIntVarValue(_varName, int)
      break
    case 'bool':
      liveBridgeDraftBoard.setBoolVarValue(_varName, value === true)
      break
    case 'vector':
      liveBridgeDraftBoard.setVectorVarValue(_varName, asSimVec4(value, 0))
      break
    case 'quat':
      liveBridgeDraftBoard.setQuatVarValue(_varName, asSimVec4(value, 1))
      break
  }
}

const applyLiveBridgeLiveWrapper = (name: string, value: unknown) => {
  const _name = String(name ?? '').trim()
  if (!_name) return

  const number = Number(value)
  if (!Number.isFinite(number)) return

  liveBridgeDraftBoard.setWrapperWeightValue(_name, number)
}

const applyLiveBridgeSnapshotOperation = (message: Record<string, unknown>) => {
  const features = message.features as Record<string, Record<string, LiveTyped>> | undefined
  if (features) {
    for (const [feat, props] of Object.entries(features)) {
      for (const [prop, typed] of Object.entries(props ?? {})) {
        applyLiveBridgeLiveTypedFeature(feat, prop, typed ?? {})
      }
    }
  }

  const vars = message.vars as Record<string, LiveTyped> | undefined
  if (vars) {
    for (const [name, typed] of Object.entries(vars)) {
      applyLiveBridgeLiveTypedVar(name, typed ?? {})
    }
  }

  const wrappers = message.wrappers as Record<string, unknown> | undefined
  if (wrappers) {
    for (const [name, value] of Object.entries(wrappers)) {
      applyLiveBridgeLiveWrapper(name, value)
    }
  }
}

const applyLiveBridgeSetFeatureOperation = (message: Record<string, unknown>) => {
  const feature = String(message.feature ?? '')
  const props = message.props as Array<{ name?: unknown; type?: unknown; value?: unknown }> | undefined
  if (!Array.isArray(props)) return
  for (const prop of props) {
    applyLiveBridgeLiveTypedFeature(feature, String(prop?.name ?? ''), {
      type: prop?.type != null ? String(prop.type) : undefined,
      value: prop?.value,
    })
  }
}

const applyLiveBridgeSetVarOperation = (message: Record<string, unknown>) => {
  const name = String(message.name ?? '').trim()
  if (!name) return
  applyLiveBridgeLiveTypedVar(name, {
    type: message.type != null ? String(message.type) : undefined,
    value: message.value,
  })
}

const applyLiveBridgeSetWrapperOperation = (message: Record<string, unknown>) => {
  const name = String(message.name ?? '').trim()
  if (!name) return
  applyLiveBridgeLiveWrapper(name, message.value)
}

const applyLiveBridgeFireExternalOperation = (message: Record<string, unknown>) => {
  const name = String(message.name ?? '').trim()
  if (!name) return
  sim.fireExternal(name)
}

const applyLiveBridgeServiceEventOperation = (message: Record<string, unknown>) => {
  const event = message.event as SimServiceEvent | undefined
  if (!event || typeof event !== 'object' || !('kind' in event)) return
  sim.getPrimaryRunner()?.pushServiceEvent(event)
}

const applyLiveBridgeTickOperation = (message: Record<string, unknown>) => {
  const externalClockDriver = liveBridgeExternalSimDriverRef.value
  if (!externalClockDriver) return

  const externalEvents = message.externalEvents
  if (Array.isArray(externalEvents)) {
    for (const externalEventNameRaw of externalEvents) {
      const externalEventName = String(externalEventNameRaw ?? '').trim()
      if (externalEventName) sim.fireExternal(externalEventName)
    }
  }
  
  const gameDt = Number(message.dt)
  const gameRaw = Number(message.rawDt)
  externalClockDriver.tick(gameDt, gameRaw)
}

/** Apply one JSON line from the game bridge (snapshot / setFeature / setVar / fireExternal). */
const _onLiveBridgeLine = (line: string) => {
  if (!liveBridgeActiveComputed.value) return

  let message: Record<string, unknown>
  try {
    message = JSON.parse(line) as Record<string, unknown>
  } catch {
    return
  }

  const operation = String(message.op ?? '')
  switch (operation) {
    case 'snapshot':
      applyLiveBridgeSnapshotOperation(message)
      return
    case 'setFeature':
      applyLiveBridgeSetFeatureOperation(message)
      return
    case 'setVar':
      applyLiveBridgeSetVarOperation(message)
      return
    case 'setWrapper':
      applyLiveBridgeSetWrapperOperation(message)
      return
    case 'fireExternal':
      applyLiveBridgeFireExternalOperation(message)
      return
    case 'serviceEvent':
      applyLiveBridgeServiceEventOperation(message)
      return
    case 'tick':
      applyLiveBridgeTickOperation(message)
      return
  }
}

const _onLiveBridgeStatus = (status: { enabled: boolean; connected: boolean }) => {
  // enabled=false means backend stopped (or WS died). Ignore while still
  // connecting — handshake must not cancel an in-flight start.
  if (!status.enabled) {
    if (liveBridgeConnectionStatusRef.value === 'connecting') return
    disconnectLiveBridge()
    return
  }

  liveBridgeConnectionStatusRef.value = status.connected ? 'connected' : 'disconnected'
}

const connectLiveBridge = (): boolean => {
  if (liveBridgeActiveComputed.value) {
    return false
  }
  
  const externalSimDriver = sim.acquireExternalSimDriver()
  if (!externalSimDriver) {
    return false
  }

  sim.registerDraftBoard(liveBridgeDraftBoard, LIVE_BRIDGE_DRAFT_BOARD_PRIORITY)

  liveBridgeExternalSimDriverRef.value = externalSimDriver
  externalSimDriver.activate()

  liveBridgeStatusSub = onLiveBridgeStatus(_onLiveBridgeStatus)
  liveBridgeLineSub = onLiveBridgeLine(_onLiveBridgeLine)

  liveBridgeConnectionStatusRef.value = 'connecting'

  liveBridgeStart(getLiveBridgeSettings()).catch(() => {
    disconnectLiveBridge()
  })

  return true
}

const disconnectLiveBridge = (): boolean => {
  const externalSimDriver = liveBridgeExternalSimDriverRef.value
  const liveBridgeActive = liveBridgeActiveComputed.value
  if (!liveBridgeActive || !externalSimDriver) {
    return false
  }
  
  externalSimDriver.deactivate()
  sim.releaseExternalSimDriver(externalSimDriver)
  liveBridgeExternalSimDriverRef.value = undefined

  sim.unregisterDraftBoard(liveBridgeDraftBoard.id)

  liveBridgeStatusSub?.()
  liveBridgeLineSub?.()
  liveBridgeStatusSub = undefined
  liveBridgeLineSub = undefined

  liveBridgeConnectionStatusRef.value = 'disconnected'

  liveBridgeStop().catch(() => {
    console.error('Failed to disconnect from live bridge')
  })

  return true
}

export type AnimgraphSimLiveBridge = {
  readonly activeComputed: ComputedRef<boolean>
  readonly connectionStatusRef: Readonly<Ref<LiveBridgeConnectionStatus>>
  readonly connect: () => boolean
  readonly disconnect: () => boolean
}

export const liveBridge: AnimgraphSimLiveBridge = {
  activeComputed: liveBridgeActiveComputed,
  connectionStatusRef: liveBridgeConnectionStatusRef,
  connect: connectLiveBridge,
  disconnect: disconnectLiveBridge,
}

// #endregion