import type { Ref } from 'vue'
import { nextTick, ref } from 'vue'
import { PixiGraphRenderer } from '../utils/PixiGraphRenderer'
import { MAIN_DIAGRAM_ID } from '../utils/graph/diagramTypes'
import { activeDiagramId, getRenderData } from '../stores/graphProject'
import { windows, windowProjectDiagramId } from '../stores/appWindows'
import {
  activateMainRenderer,
  destroyAllMainDiagramRenderers,
  getDiagramViewApi,
  getMainRendererForDiagram,
  setMainRendererForDiagram,
  syncBodyRendererActivity,
} from '../stores/diagramRenderers'
import { getWindowStack } from '../stores/windowStacks'

export const diagramViewReadyRef = ref(false)
let diagramRenderToken = 0

const canvasByDiagram = new Map<string, HTMLDivElement>()

export type MainDiagramMountHost = {
  updateGraphInteractionGate: () => void
  setupCanvasControls: (canvas: HTMLDivElement, renderer: PixiGraphRenderer) => void
  updateDebugSettings: () => void
  updateConnectionSettings: () => void
  handleMainGraphNodeSelect: (
    nodeIds: string[],
    primaryNodeId: string | null,
    event?: MouseEvent
  ) => void
  openLensForNode: (node: any, host: 'body' | 'window') => void
  handlePinConnect: (payload: {
    fromNodeId: string
    toNodeId: string
    pinName: string
  }) => void
  handlePinRewire: (payload: any) => void
  simReset: () => void
  simRebind: () => void
}

let mountHost: MainDiagramMountHost | null = null

function requireMountHost(): MainDiagramMountHost {
  if (!mountHost) throw new Error('bindMainDiagramMount() / bindGraphDocument() must be called first')
  return mountHost
}

export function bindMainDiagramMount(next: MainDiagramMountHost) {
  mountHost = next
}

/** Register / unregister a per-diagram Main canvas element. */
export function bindDiagramCanvasEl(diagramId: string, el: unknown) {
  if (el instanceof HTMLDivElement) {
    canvasByDiagram.set(diagramId, el)
    return
  }
  canvasByDiagram.delete(diagramId)
}

export function getDiagramCanvasEl(diagramId: string): HTMLDivElement | null {
  return canvasByDiagram.get(diagramId) ?? null
}

export const syncDiagramReadyFromCanvas = (diagramId: string = MAIN_DIAGRAM_ID) => {
  const el = canvasByDiagram.get(diagramId)
  const renderer = getMainRendererForDiagram(diagramId)
  if (!el || !getRenderData(diagramId)) {
    if (activeDiagramId.value === diagramId) diagramViewReadyRef.value = false
    return
  }
  const ready = Boolean(renderer && el.querySelector('canvas'))
  if (activeDiagramId.value === diagramId) {
    diagramViewReadyRef.value = ready
  }
}

function wireMainRenderer(diagramId: string, canvas: HTMLDivElement, renderer: PixiGraphRenderer) {
  const host = requireMountHost()
  renderer.setOnNodeSelect(host.handleMainGraphNodeSelect)
  renderer.setOnOpenNodeScope((nodeId) => {
    const node = getRenderData(diagramId)?.allNodes.get(nodeId)
    if (!node) return
    host.openLensForNode(node, 'body')
  })
  renderer.setOnPinConnect(host.handlePinConnect)
  renderer.setOnPinRewire(host.handlePinRewire)
  host.updateGraphInteractionGate()
  host.setupCanvasControls(canvas, renderer)
  host.updateDebugSettings()
  host.updateConnectionSettings()
}

/**
 * Create Main renderer for diagramId if missing. Does not clear windows / parallels.
 */
export function ensureDiagramRenderer(diagramId: string): PixiGraphRenderer | null {
  const existing = getMainRendererForDiagram(diagramId)
  if (existing) return existing

  const canvas = canvasByDiagram.get(diagramId)
  const data = getRenderData(diagramId)
  if (!canvas || !data) return null

  const token = ++diagramRenderToken
  try {
    const renderer = new PixiGraphRenderer(canvas, data)
    wireMainRenderer(diagramId, canvas, renderer)
    if (token !== diagramRenderToken) {
      renderer.destroy()
      return null
    }
    setMainRendererForDiagram(diagramId, renderer)
    void renderer._initPromise.then(() => {
      if (token !== diagramRenderToken) return
      if (getMainRendererForDiagram(diagramId) !== renderer) return
      syncDiagramReadyFromCanvas(diagramId)
    })
    return renderer
  } catch (error) {
    console.error('Error ensuring diagram renderer:', error)
    return null
  }
}

/**
 * Soft diagram switch: keep other diagrams' renderers alive (suspended).
 * Does not destroy body views or windows.
 * Does not reset sim — runners / board stay live across soft activate.
 */
export function softActivateDiagram(diagramId: string) {
  const data = getRenderData(diagramId)
  if (!data) {
    diagramViewReadyRef.value = false
    return
  }

  ensureDiagramRenderer(diagramId)
  activateMainRenderer(diagramId)

  // Suspend window stack layers that belong to other diagrams (keep alive).
  for (const win of windows.value) {
    const owned = windowProjectDiagramId(win)
    if (owned == null) continue
    const suspended = owned !== diagramId
    for (const entry of getWindowStack(win.id)) {
      getDiagramViewApi(entry.id)?.getRenderer()?.setSuspended(suspended)
    }
  }

  syncBodyRendererActivity()
  syncDiagramReadyFromCanvas(diagramId)
  const renderer = getMainRendererForDiagram(diagramId)
  diagramViewReadyRef.value = Boolean(renderer && canvasByDiagram.get(diagramId)?.querySelector('canvas'))
}

/**
 * Hard remount of Main Pixi surface for the active diagram.
 * Caller (projectViewSession) owns body chrome / windows wipe before this.
 */
export function remountProject(diagramId: string = MAIN_DIAGRAM_ID) {
  const data = getRenderData(diagramId)
  if (!data) {
    teardownProjectView()
    return
  }

  const token = ++diagramRenderToken
  diagramViewReadyRef.value = false
  requireMountHost().simReset()
  destroyAllMainDiagramRenderers()

  // After body v-for paints, canvas refs are bound via bindDiagramCanvasEl.
  void nextTick(() => {
    if (token !== diagramRenderToken) return
    const canvas = canvasByDiagram.get(diagramId)
    if (!canvas) {
      diagramViewReadyRef.value = false
      return
    }
    try {
      const renderer = new PixiGraphRenderer(canvas, data)
      wireMainRenderer(diagramId, canvas, renderer)
      if (token !== diagramRenderToken) {
        renderer.destroy()
        return
      }
      setMainRendererForDiagram(diagramId, renderer)
      activateMainRenderer(diagramId)
      requireMountHost().simRebind()

      void renderer._initPromise.then(() => {
        if (token !== diagramRenderToken) return
        if (getMainRendererForDiagram(diagramId) !== renderer) return
        syncDiagramReadyFromCanvas(diagramId)
        diagramViewReadyRef.value = true
      })
      window.setTimeout(() => {
        if (token !== diagramRenderToken) return
        syncDiagramReadyFromCanvas(diagramId)
      }, 100)
      window.setTimeout(() => {
        if (token !== diagramRenderToken) return
        syncDiagramReadyFromCanvas(diagramId)
      }, 1000)
    } catch (error) {
      console.error('Error remounting project view:', error)
      if (token === diagramRenderToken) {
        diagramViewReadyRef.value = false
      }
    }
  })
}

/** Destroy all Main renderers and mark view not ready (project closed / empty). */
export function teardownProjectView() {
  diagramRenderToken += 1
  diagramViewReadyRef.value = false
  try {
    requireMountHost().simReset()
  } catch {
    // Host may be unbound during early teardown.
  }
  destroyAllMainDiagramRenderers()
}

/** @deprecated Use remountProject */
export const renderGraph = remountProject

/** @deprecated Prefer bindDiagramCanvasEl — kept for older single-canvas wiring. */
export type { Ref }
