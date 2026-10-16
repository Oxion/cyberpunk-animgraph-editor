/**
 * Singleton animgraph simulation runtime (clock, runners, board, libraries).
 * Created once for the app; UI (SimPanel, windows) imports from here.
 * Do not import concrete HandleDef instances here (circular with their resolvers).
 */
import { ref, watch } from 'vue'
import { useAnimgraphSim } from '../composables/useAnimgraphSim'
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

export const animgraphSim = useAnimgraphSim()

export const {
  enabled: simEnabled,
  active: simActive,
  playing: simPlaying,
  getPrimaryRunner: simGetPrimaryRunner,
  getRunner: simGetRunner,
  getRootRunnerId: simGetRootRunnerId,
  ensureRunner: simEnsureRunner,
  ensureSlotRunner: simEnsureSlotRunner,
  listSlotRunners: simListSlotRunners,
  listBoundRunnerTree: simListBoundRunnerTree,
  listBoundRunnerTreeForDiagram: simListBoundRunnerTreeForDiagram,
  listBoundRunnerPaths: simListBoundRunnerPaths,
  setSlotDiagramId: simSetSlotDiagramId,
  getSlotDiagramId: simGetSlotDiagramId,
  getSlotRunnerId: simGetSlotRunnerId,
  setRunnerDiagramId: simSetRunnerDiagramId,
  findRunnerByDiagramId: simFindRunnerByDiagramId,
  findRunnersByDiagramId: simFindRunnersByDiagramId,
  withFeatureBatch: simWithFeatureBatch,
  getFeature: simGetFeature,
  getBoolFeature: simGetBoolFeature,
  getStringFeature: simGetStringFeature,
  getVectorFeature: simGetVectorFeature,
  getQuatFeature: simGetQuatFeature,
  /** Active-diagram view via runner lookup (computed). */
  snapshot: simSnapshot,
  snapshotsByRunner: simSnapshotsByRunner,
  runnersRev: simRunnersRev,
  snapshotForDiagram: simSnapshotForDiagram,
  snapshotForRunner: simSnapshotForRunner,
  getSkeletonViewPose: simGetSkeletonViewPose,
  discovered: simDiscovered,
  eventDraft: simEventDraft,
  eventValueDraft: simEventValueDraft,
  featureDrafts: simFeatureDrafts,
  vectorFeatureDrafts: simVectorFeatureDrafts,
  quatFeatureDrafts: simQuatFeatureDrafts,
  boolFeatureDrafts: simBoolFeatureDrafts,
  stringFeatureDrafts: simStringFeatureDrafts,
  floatVarDrafts: simFloatVarDrafts,
  vectorVarDrafts: simVectorVarDrafts,
  quatVarDrafts: simQuatVarDrafts,
  boolVarDrafts: simBoolVarDrafts,
  intVarDrafts: simIntVarDrafts,
  tagValueDrafts: simTagValueDrafts,
  entityTagDrafts: simEntityTagDrafts,
  wrapperWeightDrafts: simWrapperWeightDrafts,
  clipStats: simClipStats,
  clipNames: simClipNames,
  setupEntries: simSetupEntries,
  animDbStats: simAnimDbStats,
  animDatabases: simAnimDatabases,
  rigEntries: simRigEntries,
  activeRigBones: simActiveRigBones,
  activeRigParts: simActiveRigParts,
  clipPoseSets: simClipPoseSets,
  getClipGlbInfo: simGetClipGlbInfo,
  listGlbAnimNames: simListGlbAnimNames,
  draftFeatureValue: simDraftFeatureValue,
  draftVectorFeatureValue: simDraftVectorFeatureValue,
  draftQuatFeatureValue: simDraftQuatFeatureValue,
  draftBoolFeatureValue: simDraftBoolFeatureValue,
  draftStringFeatureValue: simDraftStringFeatureValue,
  getClip: simGetClip,
  lookupClip: simLookupClip,
  isClipActive: simIsClipActive,
  listClipSets: simListClipSets,
  loadAnimsetJson: simLoadAnimsetJson,
  loadAnimsetGlb: simLoadAnimsetGlb,
  clearAnimsetGlb: simClearAnimsetGlb,
  loadClipLibraryJson: simLoadClipLibraryJson,
  clearClipLibrary: simClearClipLibrary,
  clearClipPoseLibrary: simClearClipPoseLibrary,
  loadRigJson: simLoadRigJson,
  removeRig: simRemoveRig,
  setActiveRig: simSetActiveRig,
  clearRigLibrary: simClearRigLibrary,
  stackCaptureHandleIds: simStackCaptureHandleIds,
  getDerivedPoseStats: simGetDerivedPoseStats,
  sampleWarningsEnabled: simSampleWarningsEnabled,
  setSampleWarningsEnabled: simSetSampleWarningsEnabled,
  updateWarningsEnabled: simUpdateWarningsEnabled,
  setUpdateWarningsEnabled: simSetUpdateWarningsEnabled,
  setStackCaptureHandleIds: simSetStackCaptureHandleIds,
  loadAnimDatabaseJson: simLoadAnimDatabaseJson,
  loadAnimDatabaseLibraryJson: simLoadAnimDatabaseLibraryJson,
  clearAnimDatabaseLibrary: simClearAnimDatabaseLibrary,
  removeAnimDatabase: simRemoveAnimDatabase,
  updateSetupEntry: simUpdateSetupEntry,
  removeSetupEntry: simRemoveSetupEntry,
  exportCompactClipLibrary: simExportCompactClipLibrary,
  exportCompactAnimDatabaseLibrary: simExportCompactAnimDatabaseLibrary,
  getCachedClipPoseCompactText: simGetCachedClipPoseCompactText,
  play: simPlay,
  pause: simPause,
  toggle: simToggle,
  step: simStep,
  reset: simReset,
  activate: simActivate,
  deactivate: simDeactivate,
  toggleActive: simToggleActive,
  setSpeed: simSetSpeed,
  fireExternal: simFireExternal,
  fireAnimEvent: simFireAnimEvent,
  fireAnimEnd: simFireAnimEnd,
  setFloatVar: simSetFloatVar,
  setVectorVar: simSetVectorVar,
  setVectorVarAxis: simSetVectorVarAxis,
  draftVectorVarValue: simDraftVectorVarValue,
  setQuatVar: simSetQuatVar,
  setQuatVarAxis: simSetQuatVarAxis,
  draftQuatVarValue: simDraftQuatVarValue,
  setBoolVar: simSetBoolVar,
  setIntVar: simSetIntVar,
  setTagValue: simSetTagValue,
  setEntityTag: simSetEntityTag,
  removeEntityTag: simRemoveEntityTag,
  setWrapperWeight: simSetWrapperWeight,
  setFeature: simSetFeature,
  setBoolFeature: simSetBoolFeature,
  setStringFeature: simSetStringFeature,
  setVectorFeature: simSetVectorFeature,
  setVectorFeatureAxis: simSetVectorFeatureAxis,
  setQuatFeature: simSetQuatFeature,
  setQuatFeatureAxis: simSetQuatFeatureAxis,
  rebind: simRebind,
  dispose: disposeAnimgraphSimInner,
  getProjectSimResources: getProjectSimResourcesInner,
  applyProjectSimResources: applyProjectSimResourcesInner,
} = animgraphSim

bindWorkspotHubFeatureApi(() => ({
  setFeature: simSetFeature,
  setBoolFeature: simSetBoolFeature,
  setStringFeature: simSetStringFeature,
  setVectorFeature: simSetVectorFeature,
  setQuatFeature: simSetQuatFeature,
  getFeature: simGetFeature,
  getBoolFeature: simGetBoolFeature,
  getStringFeature: simGetStringFeature,
  getVectorFeature: simGetVectorFeature,
  getQuatFeature: simGetQuatFeature,
  withBatch: simWithFeatureBatch,
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
  if (handleDef.resolveAttachCtx) handleDef.attach(handle)
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

watch(simRunnersRev, () => {
  syncSimDriverAttachments()
})

export function simGetProjectSimResources(opts?: { includeClipPoses?: boolean }) {
  const base = getProjectSimResourcesInner(opts)
  const simDriversJson = exportSimDrivers()
  if (base == null && simDriversJson == null) return null
  return {
    ...(base ?? {}),
    simDrivers: simDriversJson,
  }
}

export function simApplyProjectSimResources(
  resources: Parameters<typeof applyProjectSimResourcesInner>[0] & {
    simDrivers?: SimDriversProjectJson | null
  } | null
) {
  applyProjectSimResourcesInner(resources)
  applySimDrivers(resources?.simDrivers)
}

export function disposeAnimgraphSim() {
  disposeAllSimDrivers()
  disposeAnimgraphSimInner()
}

/** Bump structural rev when a concrete HandleDef user mutates attach state. */
export function bumpSimDriversStructural(dirty = true): void {
  bumpDriversStructural(dirty)
}
