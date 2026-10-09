import { ref, watch, type Ref } from 'vue'
import { fsDelete, fsLoadJson, fsSaveJson, fsSaveText } from '../api/fsApi'
import { pushRecentFile } from './fsFavorites'
import type { AnimgraphData, AnimgraphNode } from '../utils/graph/animgraphTypes'
import {
  MAIN_DIAGRAM_ID,
  type AnimgraphProjectFile,
  type AnimgraphVisualizerData,
  type RenderData,
} from '../utils/graph/diagramTypes'
import type { DirectChildrenLayoutMode } from '../utils/graph/DirectChildrenLayout'
import type { AnimClipSetupJson } from '../utils/sim/clipLibrary'
import type { AnimDatabaseLibraryJson } from '../utils/sim/animDatabase'
import type { ClipPoseLibraryJson } from '../utils/sim/clipPoseLibrary'
import { AnimgraphParser } from '../utils/AnimgraphParser'
import {
  collectFloatingHandleIdsForSave,
  collectHandlesRegistryForSave,
} from '../utils/graph/floatingHandles'
import { clearGraphHistory } from './graphHistory'
import {
  clearProjectDirty,
  confirmDiscardUnsavedChanges,
  markProjectDirty,
} from './projectDirty'
import { clearSelectionState, bumpConnectionsRevision } from './graphSession'
import {
  activeDiagramId,
  addDiagram,
  getRenderData,
  hasDiagramId,
  hasProject,
  listDiagramIds,
  projectRef,
  resetProject,
  setActiveDiagramId,
  setProject,
} from './graphProject'
import {
  presentAddedDiagram,
  presentClosedProject,
  presentReplacedProject,
} from './projectViewSession'
import { toolManager } from './toolManager'
import { diagramViewReadyRef } from '../composables/useMainDiagramMount'

export type GraphDocumentIoHost = {
  directChildrenLayoutMode: Ref<DirectChildrenLayoutMode>
  /**
   * Prompt for diagram id. mode=first → UI should show disabled "main".
   * Return null to cancel.
   */
  promptDiagramId?: (mode: 'first' | 'additional') => Promise<string | null>
  /** Snapshot sim clip setup + anim DBs for project export (optional). */
  getProjectSimResources?: (opts?: { includeClipPoses?: boolean }) => {
    clipSetup?: AnimClipSetupJson
    animDatabaseLibrary?: AnimDatabaseLibraryJson
    entityTags?: Record<string, boolean>
    rigLibrary?: import('../utils/sim/rigResource').RigLibraryJson
    clipPoseLibrary?: ClipPoseLibraryJson
    clipPoseRevision?: number
  } | null
  /** Compact clip-pose JSON for sidecar write (null if empty). */
  getCachedClipPoseCompactText?: () => string | null
  /** Restore / clear sim resources after project load. */
  applyProjectSimResources?: (
    resources: {
      clipSetup?: AnimClipSetupJson
      animDatabaseLibrary?: AnimDatabaseLibraryJson
      entityTags?: Record<string, boolean>
      rigLibrary?: import('../utils/sim/rigResource').RigLibraryJson
      clipPoseLibrary?: ClipPoseLibraryJson
    } | null
  ) => void
}

/** Sibling of project.json holding processed GLB pose curves (compact). */
export function clipPoseSidecarPath(projectPath: string): string {
  return projectPath.toLowerCase().endsWith('.json')
    ? projectPath.replace(/\.json$/i, '.clipposes.json')
    : `${projectPath}.clipposes.json`
}

/** Last pose revision written to sidecar — skip rewrite when unchanged. */
let lastSavedClipPoseRev = -1

let host: GraphDocumentIoHost | null = null
function requireHost(): GraphDocumentIoHost {
  if (!host) throw new Error('bindGraphDocumentIo() must be called first')
  return host
}

export function bindGraphDocumentIo(next: GraphDocumentIoHost) {
  host = next
}

export const loadingRef = ref(false)
export const fileSize = ref(0)

export const detectFileType = (data: any): 'animgraph' | 'render' | 'project' => {
  if (data?.type === 'animgraph-project' && Array.isArray(data.diagrams)) {
    return 'project'
  }
  if (data.Data && data.Data.RootChunk && data.Data.RootChunk.$type === 'animAnimGraph') {
    return 'animgraph'
  }
  if (data.nodes && data.connections && data.originalAnimgraph) {
    return 'render'
  }
  throw new Error(
    'Unable to detect file type. File must be animgraph, editor render data, or animgraph-project'
  )
}

export const processParsedData = async (data: any): Promise<RenderData> => {
  const parser = new AnimgraphParser({
    directChildrenLayout: requireHost().directChildrenLayoutMode.value,
  })
  const detectedType = detectFileType(data)
  if (detectedType === 'project') {
    throw new Error('processParsedData does not accept project files; use loadProjectFile')
  }

  console.log('Auto-detected file type:', detectedType)

  if (detectedType === 'animgraph') {
    if (!data.Data.RootChunk.nodesToInit) {
      throw new Error('Invalid animgraph data: missing nodesToInit')
    }
    return await parser.parseForRender(data.Data.RootChunk)
  }
  return await parser.loadAnimgraphVisualizerData(data)
}

async function resolveDiagramIdForLoad(
  preferred: string | undefined,
  opts?: { allowExisting?: boolean }
): Promise<string | null> {
  if (preferred != null) {
    const id = preferred.trim()
    if (!id) {
      alert('Diagram id must be non-empty')
      return null
    }
    if (!opts?.allowExisting && hasDiagramId(id)) {
      alert(`Diagram id already exists: "${id}"`)
      return null
    }
    return id
  }
  const mode: 'first' | 'additional' = hasProject.value ? 'additional' : 'first'
  const prompt = requireHost().promptDiagramId
  if (prompt) {
    return prompt(mode)
  }
  if (mode === 'first') return MAIN_DIAGRAM_ID
  const suggested = 'diagram'
  const entered = window.prompt('Diagram id (must be unique in project):', suggested)
  if (entered == null) return null
  const id = entered.trim()
  if (!id) {
    alert('Diagram id must be non-empty')
    return null
  }
  if (hasDiagramId(id)) {
    alert(`Diagram id already exists: "${id}"`)
    return null
  }
  return id
}

function commitDiagramToProject(diagramId: string, renderData: RenderData, replaceProject: boolean) {
  toolManager.deactivateAll()
  if (replaceProject || !projectRef.value) {
    clearSelectionState()
    clearGraphHistory()
    setProject(
      { mainDiagramId: diagramId, diagrams: [{ id: diagramId, data: renderData }] },
      diagramId
    )
    bumpConnectionsRevision(diagramId)
    presentReplacedProject(diagramId)
    return
  }
  addDiagram(diagramId, renderData)
  clearGraphHistory(diagramId)
  setActiveDiagramId(diagramId)
  bumpConnectionsRevision(diagramId)
  presentAddedDiagram(diagramId)
}

export const loadProjectFile = async (data: AnimgraphProjectFile) => {
  const parser = new AnimgraphParser({
    directChildrenLayout: requireHost().directChildrenLayoutMode.value,
  })
  if (!data.diagrams?.length) {
    throw new Error('Project file has no diagrams')
  }
  if (!data.mainDiagramId?.trim()) {
    throw new Error('Project file is missing mainDiagramId')
  }
  const diagrams = []
  for (const entry of data.diagrams) {
    if (!entry.id || !entry.data) {
      throw new Error('Invalid project diagram entry')
    }
    const renderData = await parser.loadAnimgraphVisualizerData(entry.data)
    diagrams.push({ id: entry.id, data: renderData })
  }
  toolManager.deactivateAll()
  clearSelectionState()
  clearGraphHistory()
  setProject(
    { mainDiagramId: data.mainDiagramId, diagrams },
    data.mainDiagramId
  )
  for (const d of diagrams) {
    bumpConnectionsRevision(d.id)
  }
  requireHost().applyProjectSimResources?.({
    clipSetup: data.clipSetup,
    animDatabaseLibrary: data.animDatabaseLibrary,
    entityTags: data.entityTags,
    rigLibrary: data.rigLibrary,
    clipPoseLibrary: data.clipPoseLibrary,
  })
  presentReplacedProject(data.mainDiagramId)
  clearProjectDirty()
}

export type LoadIntent = 'open' | 'add'

export type PendingDiagramLoad = {
  source: 'path' | 'file'
  /** Absolute path when source is path (for recent / Save). */
  path: string | null
  label: string
  kind: 'animgraph' | 'render' | 'project'
  intent: LoadIntent
  data: unknown
  /** For project kind (add): ids listed in the file. */
  projectDiagramIds?: string[]
  /** For project kind (add): which source diagram to import. */
  sourceDiagramId?: string
}

export const pendingDiagramLoad = ref<PendingDiagramLoad | null>(null)

export function cancelPendingDiagramLoad() {
  const hadPending = pendingDiagramLoad.value != null
  pendingDiagramLoad.value = null
  // beginLoad may have flipped ready off before pending; restore canvas if we aborted.
  if (hadPending && hasProject.value) {
    diagramViewReadyRef.value = true
  }
}

function basenamePath(filePath: string): string {
  return filePath.replace(/^.*[/\\]/, '') || filePath
}

function projectDiagramIdsFromFile(data: AnimgraphProjectFile): string[] {
  return (data.diagrams ?? []).map((d) => d.id).filter((id): id is string => Boolean(id?.trim()))
}

async function parseProjectDiagramEntry(
  data: AnimgraphProjectFile,
  sourceDiagramId: string
): Promise<RenderData> {
  const entry = data.diagrams.find((d) => d.id === sourceDiagramId)
  if (!entry?.data) {
    throw new Error(`Project has no diagram "${sourceDiagramId}"`)
  }
  const parser = new AnimgraphParser({
    directChildrenLayout: requireHost().directChildrenLayoutMode.value,
  })
  return parser.loadAnimgraphVisualizerData(entry.data)
}

function buildPendingFromParsed(
  detected: 'animgraph' | 'render' | 'project',
  data: unknown,
  meta: { source: 'path' | 'file'; path: string | null; label: string; intent: LoadIntent }
): PendingDiagramLoad {
  if (detected === 'project') {
    const project = data as AnimgraphProjectFile
    const ids = projectDiagramIdsFromFile(project)
    const sourceDiagramId =
      (project.mainDiagramId?.trim() && ids.includes(project.mainDiagramId)
        ? project.mainDiagramId
        : ids[0]) ?? ''
    return {
      ...meta,
      kind: 'project',
      data,
      projectDiagramIds: ids,
      sourceDiagramId,
    }
  }
  return {
    ...meta,
    kind: detected,
    data,
  }
}

/**
 * Step 1: open path.
 * open → project commits immediately; animgraph/render waits for confirm (always new project).
 * add → all kinds wait for confirm (import into current project).
 */
export const beginLoadFromPath = async (
  filePath: string,
  opts?: { intent?: LoadIntent }
) => {
  const intent: LoadIntent = opts?.intent ?? 'open'
  try {
    if (intent === 'add' && !hasProject.value) {
      alert('Open or create a project before adding an animgraph.')
      return
    }
    loadingFromServer.value = true
    cancelPendingDiagramLoad()
    const data = await fsLoadJson(filePath)
    const detected = detectFileType(data)
    if (intent === 'open' && detected === 'project') {
      if (hasProject.value && !confirmDiscardUnsavedChanges()) return
      diagramViewReadyRef.value = false
      const project = data as AnimgraphProjectFile
      if (project.clipPoseLibrary == null) {
        try {
          const poses = await fsLoadJson(clipPoseSidecarPath(filePath))
          if (
            poses &&
            typeof poses === 'object' &&
            Array.isArray((poses as ClipPoseLibraryJson).sets)
          ) {
            project.clipPoseLibrary = poses as ClipPoseLibraryJson
          }
        } catch {
          // no sidecar
        }
      }
      await loadProjectFile(project)
      currentLoadedPath.value = filePath
      pushRecentFile(filePath)
      lastSavedClipPoseRev =
        requireHost().getProjectSimResources?.()?.clipPoseRevision ?? -1
      showWelcomeOpen.value = false
      showAddAnimgraphDialog.value = false
      return
    }
    if (intent === 'add' && detected === 'project') {
      const ids = projectDiagramIdsFromFile(data as AnimgraphProjectFile)
      if (!ids.length) {
        alert('Project file has no diagrams')
        return
      }
    }
    // Pending confirm — do not blank the current diagram view.
    pendingDiagramLoad.value = buildPendingFromParsed(detected, data, {
      source: 'path',
      path: filePath,
      label: basenamePath(filePath),
      intent,
    })
  } catch (error) {
    console.error('Error loading graph:', error)
    alert(`Error loading graph: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    loadingFromServer.value = false
  }
}

/**
 * Step 1: open browser File (drop / pick).
 */
export const beginLoadFromFile = async (file: File, opts?: { intent?: LoadIntent }) => {
  const intent: LoadIntent = opts?.intent ?? 'open'
  try {
    if (intent === 'add' && !hasProject.value) {
      alert('Open or create a project before adding an animgraph.')
      return
    }
    loadingRef.value = true
    cancelPendingDiagramLoad()
    fileSize.value = file.size
    const text = await file.text()
    const data = JSON.parse(text)
    const detected = detectFileType(data)
    if (intent === 'open' && detected === 'project') {
      if (hasProject.value && !confirmDiscardUnsavedChanges()) return
      diagramViewReadyRef.value = false
      await loadProjectFile(data as AnimgraphProjectFile)
      currentLoadedPath.value = null
      showWelcomeOpen.value = false
      showAddAnimgraphDialog.value = false
      return
    }
    if (intent === 'add' && detected === 'project') {
      const ids = projectDiagramIdsFromFile(data as AnimgraphProjectFile)
      if (!ids.length) {
        alert('Project file has no diagrams')
        return
      }
    }
    // Pending confirm — do not blank the current diagram view.
    pendingDiagramLoad.value = buildPendingFromParsed(detected, data, {
      source: 'file',
      path: null,
      label: file.name,
      intent,
    })
  } catch (error) {
    console.error('Error processing file:', error)
    alert(`Error processing file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    loadingRef.value = false
  }
}

/** Step 2: commit pending load with chosen diagram id (and source diagram for project-add). */
export const confirmPendingDiagramLoad = async (
  diagramIdRaw: string,
  opts?: { sourceDiagramId?: string }
) => {
  const pending = pendingDiagramLoad.value
  if (!pending) return

  const replaceProject = pending.intent === 'open'
  if (replaceProject && hasProject.value && !confirmDiscardUnsavedChanges()) {
    return
  }

  const diagramId = await resolveDiagramIdForLoad(diagramIdRaw, {
    allowExisting: replaceProject,
  })
  if (!diagramId) return

  try {
    loadingRef.value = true
    diagramViewReadyRef.value = false

    let renderGraphData: RenderData
    if (pending.kind === 'project') {
      if (pending.intent !== 'add') {
        throw new Error('Project files open immediately; use Add Animgraph to import a diagram')
      }
      const sourceId = (opts?.sourceDiagramId ?? pending.sourceDiagramId ?? '').trim()
      if (!sourceId) {
        alert('Select a diagram from the project file')
        return
      }
      renderGraphData = await parseProjectDiagramEntry(
        pending.data as AnimgraphProjectFile,
        sourceId
      )
    } else {
      renderGraphData = await processParsedData(pending.data)
    }

    commitDiagramToProject(diagramId, renderGraphData, replaceProject)

    if (replaceProject) {
      // Open animgraph/render → new unsaved project (do not Save over source JSON).
      currentLoadedPath.value = null
      if (pending.path) pushRecentFile(pending.path)
      clearProjectDirty()
    } else {
      markProjectDirty()
      // Adding a diagram must not retarget Save path / recent as project file.
    }

    pendingDiagramLoad.value = null
    showWelcomeOpen.value = false
    showAddAnimgraphDialog.value = false
  } catch (error) {
    console.error('Error confirming diagram load:', error)
    alert(
      `Error loading diagram: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  } finally {
    loadingRef.value = false
  }
}

/** @deprecated Prefer beginLoadFromFile — kept for callers that already have a diagramId. */
export const processFile = async (file: File, opts?: { diagramId?: string }) => {
  if (opts?.diagramId != null) {
    await beginLoadFromFile(file)
    if (pendingDiagramLoad.value) {
      await confirmPendingDiagramLoad(opts.diagramId)
    }
    return
  }
  await beginLoadFromFile(file)
}

/** Add another animgraph/render/project-diagram into the current project. */
export const addFileToProject = async (file: File) => {
  await beginLoadFromFile(file, { intent: 'add' })
}

export const loadSampleData = async () => {
  try {
    if (hasProject.value && !confirmDiscardUnsavedChanges()) return
    const sampleData: AnimgraphData = {
      nodesToInit: [
        { HandleId: '0', Data: { $type: 'animAnimNode_Root' } },
        { HandleId: '1', Data: { $type: 'animAnimNode_Output' } },
        { HandleId: '2', Data: { $type: 'animAnimNode_Blend2' } },
      ],
      rootNode: { HandleRefId: '0' },
    }

    const renderGraphData = await processParsedData({
      Data: { RootChunk: { $type: 'animAnimGraph', ...sampleData } },
    }).catch(async () => {
      // sample is raw AnimgraphData — parse directly
      const parser = new AnimgraphParser({
        directChildrenLayout: requireHost().directChildrenLayoutMode.value,
      })
      return parser.parseForRender(sampleData)
    })

    clearSelectionState()
    clearGraphHistory()
    setProject(
      { mainDiagramId: MAIN_DIAGRAM_ID, diagrams: [{ id: MAIN_DIAGRAM_ID, data: renderGraphData }] },
      MAIN_DIAGRAM_ID
    )
    bumpConnectionsRevision(MAIN_DIAGRAM_ID)
    presentReplacedProject(MAIN_DIAGRAM_ID)
    fileSize.value = JSON.stringify(sampleData).length
    currentLoadedPath.value = null
    clearProjectDirty()
  } catch (error) {
    console.error('Error loading sample data:', error)
    alert(`Error loading sample data: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export const createProjectExportData = (opts?: {
  /** Embed poses in the project JSON (download / single-file). FS save uses sidecar instead. */
  includeClipPoses?: boolean
}): AnimgraphProjectFile | null => {
  const project = projectRef.value
  if (!project?.diagrams.length) return null
  const includeClipPoses = opts?.includeClipPoses === true
  const sim =
    requireHost().getProjectSimResources?.({ includeClipPoses }) ?? null
  const out: AnimgraphProjectFile = {
    type: 'animgraph-project',
    version: 1,
    mainDiagramId: project.mainDiagramId,
    diagrams: project.diagrams.map((d) => ({
      id: d.id,
      data: createCleanExportData(d.data),
    })),
  }
  if (sim?.clipSetup != null) out.clipSetup = sim.clipSetup
  if (sim?.animDatabaseLibrary != null) out.animDatabaseLibrary = sim.animDatabaseLibrary
  if (sim?.entityTags != null && Object.keys(sim.entityTags).length > 0) {
    out.entityTags = sim.entityTags
  }
  if (sim?.rigLibrary != null && (sim.rigLibrary.entries?.length ?? 0) > 0) {
    out.rigLibrary = sim.rigLibrary
  }
  if (
    includeClipPoses &&
    sim?.clipPoseLibrary != null &&
    (sim.clipPoseLibrary.sets?.length ?? 0) > 0
  ) {
    out.clipPoseLibrary = sim.clipPoseLibrary
  }
  return out
}

export const exportProject = () => {
  const projectData = createProjectExportData({ includeClipPoses: true })
  if (!projectData) return

  try {
    const estimatedSize = estimateDataSize(projectData)
    console.log('Estimated project export size:', formatFileSize(estimatedSize))
    const dataStr = formatJson(projectData, 'compact')
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(dataBlob)
    link.download = 'animgraph_project.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    alert(`Project export completed!\nFile size: ${formatFileSize(dataStr.length)}\nDiagrams: ${projectData.diagrams.length}`)
  } catch (error) {
    console.error('Project export error:', error)
    alert('Project export failed. Please try again.')
  }
}

/** @deprecated Prefer exportToPath via Export dialog. */
export const exportGraph = (diagramId?: string) => {
  const id = diagramId ?? activeDiagramId.value ?? listDiagramIds.value[0]
  if (!id) return
  void exportToPath('diagram', id, `animgraph_export_${id}.json`)
}

/** Header fields taken from player_ranged.animgraph.json (WolvenKit CR2W JSON). */
const WOLVENKIT_ANIMGRAPH_HEADER = {
  WolvenKitVersion: '8.16.2-nightly.2025-06-30',
  WKitJsonVersion: '0.0.9',
  GameVersion: 2200,
  DataType: 'CR2W',
} as const

function toArchiveFileName(savePath: string): string {
  let path = savePath.replace(/\.json$/i, '')
  if (!/\.animgraph$/i.test(path)) path = `${path}.animgraph`
  return path
}

/** Build WolvenKit-importable animgraph JSON (Header + Data.RootChunk with wrapped handles). */
export const createWolvenKitAnimgraphExport = (
  renderData: RenderData,
  archiveFileName: string
): Record<string, unknown> => {
  const rootChunk = JSON.parse(JSON.stringify(renderData.originalAnimgraph)) as AnimgraphData & {
    $type?: string
  }
  rootChunk.$type = 'animAnimGraph'

  const registry = new Map<string, AnimgraphNode>()
  for (const [id, handle] of renderData.handlesRegistry.entries()) {
    registry.set(id, JSON.parse(JSON.stringify(handle)) as AnimgraphNode)
  }

  const parser = new AnimgraphParser({
    directChildrenLayout: requireHost().directChildrenLayoutMode.value,
  })
  parser.wrapAnimgraphNodes(rootChunk, registry)

  return {
    Header: {
      ...WOLVENKIT_ANIMGRAPH_HEADER,
      ExportedDateTime: new Date().toISOString(),
      ArchiveFileName: archiveFileName,
    },
    Data: {
      Version: 195,
      BuildVersion: 0,
      RootChunk: rootChunk,
      EmbeddedFiles: [],
    },
  }
}

export type ExportKind = 'diagram' | 'animgraph'

export const showExportDialog = ref(false)

export function suggestedExportFileName(kind: ExportKind, diagramId: string): string {
  const safe = diagramId.trim() || 'diagram'
  return kind === 'animgraph' ? `${safe}.animgraph.json` : `${safe}.diagram.json`
}

export const exportToPath = async (
  kind: ExportKind,
  diagramId: string,
  filePath: string
) => {
  const id = diagramId.trim()
  if (!id) {
    alert('Select a diagram to export')
    return
  }
  const renderData = getRenderData(id)
  if (!renderData) {
    alert(`Diagram not found: "${id}"`)
    return
  }

  const abs = filePath.endsWith('.json') ? filePath : `${filePath}.json`
  try {
    loadingFromServer.value = true
    const payload =
      kind === 'animgraph'
        ? createWolvenKitAnimgraphExport(renderData, toArchiveFileName(abs))
        : createCleanExportData(renderData)
    await fsSaveJson(abs, payload)
    showExportDialog.value = false
    console.log(`Exported ${kind}: ${abs}`)
  } catch (error) {
    console.error('Export error:', error)
    alert(`Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`)
  } finally {
    loadingFromServer.value = false
  }
}

/** Clone unwrapped animgraph + flat registry (no game/WKit wrap). */
function serializeAnimgraphPayload(renderData: RenderData): Pick<
  AnimgraphVisualizerData,
  'originalAnimgraph' | 'handlesRegistry' | 'floatingHandleIds'
> {
  return {
    originalAnimgraph: JSON.parse(JSON.stringify(renderData.originalAnimgraph)) as AnimgraphData,
    handlesRegistry: collectHandlesRegistryForSave(renderData),
    floatingHandleIds: collectFloatingHandleIdsForSave(renderData),
  }
}

export const createCleanExportData = (renderData: RenderData): AnimgraphVisualizerData => {
  const allNodesArray: any[] = []
  renderData.allNodes.forEach((node) => {
    allNodesArray.push(createCleanNode(node))
  })
  const nodeTypesArray = Array.from(renderData.nodeTypes)
  const rootNodeIds = renderData.rootNodes.map((node) => node.id)

  return {
    rootNodeIds,
    nodes: allNodesArray,
    connections: renderData.connections,
    metadata: renderData.metadata,
    nodeTypes: nodeTypesArray,
    bounds: renderData.bounds,
    ...serializeAnimgraphPayload(renderData),
  }
}

export const estimateDataSize = (obj: any): number => {
  const estimateValue = (value: any): number => {
    if (value === null || value === undefined) return 0
    if (typeof value === 'string') return value.length * 2
    if (typeof value === 'number') return 8
    if (typeof value === 'boolean') return 4
    if (Array.isArray(value)) {
      return value.reduce((sum, item) => sum + estimateValue(item), 0)
    }
    if (typeof value === 'object') {
      return Object.keys(value).reduce((sum, key) => {
        return sum + key.length * 2 + estimateValue(value[key])
      }, 0)
    }
    return 0
  }
  return estimateValue(obj)
}

export const createCleanNode = (node: any, depth = 0): any => {
  if (depth > 50) {
    console.warn('Maximum recursion depth reached for node:', node.id)
    return { id: node.id, type: node.type, _truncated: true }
  }

  const childSlots: Record<string, { id: string; type: string }[]> = {}
  for (const [slot, kids] of Object.entries(node.childSlots ?? {})) {
    if (!Array.isArray(kids) || !kids.length) continue
    childSlots[slot] = kids.map((child: any) => ({ id: child.id, type: child.type }))
  }
  const cleanNode: any = {
    id: node.id,
    type: node.type,
    data: node.data,
    position: node.position,
    size: node.size,
    childSlots,
    parentSlot: node.parentSlot,
    description: node.description,
    metadata: node.metadata,
    bounds: node.bounds,
    isContainer: node.isContainer,
    isGroup: node.isGroup,
    groupType: node.groupType,
    zIndex: node.zIndex,
    color: node.color,
    backgroundColor: node.backgroundColor,
    borderColor: node.borderColor,
    borderWidth: node.borderWidth,
    borderRadius: node.borderRadius,
    visible: node.visible,
    opacity: node.opacity,
    scale: node.scale,
    rotation: node.rotation,
  }

  if (node.isGroup) {
    cleanNode.layout = node.layout
    cleanNode.spacing = node.spacing
    cleanNode.padding = node.padding
  }

  return cleanNode
}

export const formatJson = (data: any, format: string): string => {
  switch (format) {
    case 'pretty':
      return JSON.stringify(data, null, 2)
    case 'compact':
      return JSON.stringify(data)
    case 'minimal':
      return JSON.stringify(data).replace(/\s+/g, ' ').trim()
    default:
      return JSON.stringify(data, null, 2)
  }
}

export const createMinimalExportData = (renderData: RenderData): AnimgraphVisualizerData => {
  const allNodesArray: any[] = []
  renderData.allNodes.forEach((node) => {
    const childSlots: Record<string, string[]> = {}
    for (const [slot, kids] of Object.entries(node.childSlots ?? {})) {
      if (!Array.isArray(kids) || !kids.length) continue
      childSlots[slot] = kids.map((child: any) => child.id)
    }
    allNodesArray.push({
      id: node.id,
      type: node.type,
      data: node.data,
      position: node.position,
      size: node.size,
      childSlots,
      parentSlot: node.parentSlot,
      metadata: node.metadata,
      bounds: node.bounds,
      isContainer: node.isContainer,
      isGroup: node.isGroup,
    })
  })

  return {
    rootNodeIds: renderData.rootNodes.map((node) => node.id),
    nodes: allNodesArray,
    connections: renderData.connections,
    metadata: renderData.metadata,
    nodeTypes: Array.from(renderData.nodeTypes),
    bounds: renderData.bounds,
    ...serializeAnimgraphPayload(renderData),
  }
}

export const showSaveAsDialog = ref(false)
export const showWelcomeOpen = ref(false)
export const showAddAnimgraphDialog = ref(false)
export const loadingFromServer = ref(false)
/** Absolute FS path when opened/saved via API; null after drop/sample until Save As. */
export const currentLoadedPath = ref<string | null>(null)

export const openWelcomePanel = () => {
  if (hasProject.value) showWelcomeOpen.value = true
  showAddAnimgraphDialog.value = false
  cancelPendingDiagramLoad()
}

export const closeWelcomePanel = () => {
  showWelcomeOpen.value = false
  cancelPendingDiagramLoad()
}

export const openAddAnimgraphDialog = () => {
  if (!hasProject.value) return
  showWelcomeOpen.value = false
  showAddAnimgraphDialog.value = true
  cancelPendingDiagramLoad()
}

export const closeAddAnimgraphDialog = () => {
  showAddAnimgraphDialog.value = false
  cancelPendingDiagramLoad()
}

watch(hasProject, (value) => {
  if (value) showWelcomeOpen.value = false
  else showAddAnimgraphDialog.value = false
})

export const saveGraphToServer = async (filePath: string) => {
  // Poses go to sidecar (compact); keep main project lean/pretty for fast saves.
  const projectData = createProjectExportData({ includeClipPoses: false })
  if (!projectData) return

  const abs = filePath.endsWith('.json') ? filePath : `${filePath}.json`
  const posePath = clipPoseSidecarPath(abs)
  try {
    await fsSaveJson(abs, projectData)
    const host = requireHost()
    const poseRev = host.getProjectSimResources?.()?.clipPoseRevision ?? -1
    const poseText = host.getCachedClipPoseCompactText?.() ?? null
    if (poseText != null) {
      if (poseRev !== lastSavedClipPoseRev) {
        await fsSaveText(posePath, poseText)
        lastSavedClipPoseRev = poseRev
      }
    } else if (lastSavedClipPoseRev >= 0) {
      try {
        await fsDelete(posePath)
      } catch {
        // ignore missing sidecar
      }
      lastSavedClipPoseRev = -1
    }
    currentLoadedPath.value = abs
    pushRecentFile(abs)
    clearProjectDirty()
    console.log(`Project saved: ${abs}`)
  } catch (error) {
    console.error('Error saving graph:', error)
    alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/** @deprecated Prefer beginLoadFromPath */
export const loadGraphFromServer = async (
  filePath: string,
  opts?: { diagramId?: string }
) => {
  await beginLoadFromPath(filePath)
  if (opts?.diagramId != null && pendingDiagramLoad.value) {
    await confirmPendingDiagramLoad(opts.diagramId)
  }
}

export const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export const saveCurrentGraph = async () => {
  if (!currentLoadedPath.value) {
    showSaveAsDialog.value = true
    return
  }
  await saveGraphToServer(currentLoadedPath.value)
}

export const handleSaveAs = async (filePath: string) => {
  const trimmed = filePath.trim()
  if (!trimmed) return
  await saveGraphToServer(trimmed)
  showSaveAsDialog.value = false
}

export const closeProject = () => {
  toolManager.deactivateAll()
  clearSelectionState()
  clearGraphHistory()
  resetProject()
  presentClosedProject()
  currentLoadedPath.value = null
  cancelPendingDiagramLoad()
  clearProjectDirty()
}
