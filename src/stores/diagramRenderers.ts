import { nextTick } from 'vue'
import type { PixiGraphRenderer } from '../utils/PixiGraphRenderer'
import { SequentialIdAllocator } from '../utils/SequentialIdAllocator'
import type { SimSnapshot } from '../utils/sim'
import { currentView } from './activeGraphView'
import { focusedDiagramSurface } from './diagramFocus'
import { markDiagramViewReady } from './diagramViewReady'
import { getGraphView } from './graphViewRegistry'
import { getWindowTopViewId } from './windowStacks'

export type DiagramRendererApi = {
  fitView?: () => void
  presentDefault?: () => void
  getRenderer: () => PixiGraphRenderer | null
  focusRenderer?: () => void
  applySimOverlay?: (snapshot?: SimSnapshot) => void
}

const viewApis = new Map<string, DiagramRendererApi>()
const readyWaiters = new Map<string, Array<(renderer: PixiGraphRenderer | null) => void>>()
/** Ids handed out before mount registers into `viewApis`. */
const reservedRendererIds = new Set<string>()

const rendererIds = new SequentialIdAllocator(
  'dr',
  (id) => viewApis.has(id) || reservedRendererIds.has(id)
)

/** Reserve a unique `viewApis` key (`dr_N`). Store on GraphViewEntry.rendererId / window payload. */
export function allocDiagramRendererId(preferred?: string | null): string {
  const id = rendererIds.alloc(preferred)
  reservedRendererIds.add(id)
  return id
}

export function resetDiagramRendererIdAllocator() {
  viewApis.clear()
  reservedRendererIds.clear()
  readyWaiters.clear()
  rendererIds.reset()
}

export function registerDiagramView(rendererId: string, api: DiagramRendererApi | null) {
  if (!api) {
    viewApis.delete(rendererId)
    return
  }
  if (!reservedRendererIds.has(rendererId) && !viewApis.has(rendererId)) {
    throw new Error(`registerDiagramView: id was not allocated: ${rendererId}`)
  }
  rendererIds.note(rendererId)
  viewApis.set(rendererId, api)
}

export function getDiagramViewApi(rendererId: string): DiagramRendererApi | null {
  return viewApis.get(rendererId) ?? null
}

export function getDiagramViewRenderer(rendererId: string): PixiGraphRenderer | null {
  return viewApis.get(rendererId)?.getRenderer() ?? null
}

/** Resolve Pixi via GraphViewEntry.rendererId. */
export function getGraphViewRenderer(viewId: string): PixiGraphRenderer | null {
  const entry = getGraphView(viewId)
  return entry ? getDiagramViewRenderer(entry.rendererId) : null
}

export function getGraphViewApi(viewId: string): DiagramRendererApi | null {
  const entry = getGraphView(viewId)
  return entry ? getDiagramViewApi(entry.rendererId) : null
}

export function forEachDiagramViewApi(fn: (api: DiagramRendererApi, rendererId: string) => void) {
  viewApis.forEach((api, id) => fn(api, id))
}

export function forEachDiagramViewRenderer(
  fn: (renderer: PixiGraphRenderer, rendererId: string) => void
) {
  forEachDiagramViewApi((api, id) => {
    const renderer = api.getRenderer()
    if (renderer) fn(renderer, id)
  })
}

/** Active diagram renderer for the focused host (body stack top, or focused window). */
export function getActiveDiagramRenderer(): PixiGraphRenderer | null {
  const surface = focusedDiagramSurface.value
  if (surface?.kind === 'window') {
    const viewId = getWindowTopViewId(surface.windowId)
    return viewId ? getGraphViewRenderer(viewId) : null
  }
  const top = currentView.value
  if (!top) return null
  return getDiagramViewRenderer(top.rendererId)
}

/** Mark graph-view ready (overlay gate) and resolve renderer waiters. */
export function notifyDiagramViewReady(viewId: string) {
  markDiagramViewReady(viewId)
  const entry = getGraphView(viewId)
  if (!entry) return
  const renderer = getDiagramViewRenderer(entry.rendererId)
  const waiters = readyWaiters.get(entry.rendererId)
  if (!waiters?.length) return
  readyWaiters.delete(entry.rendererId)
  waiters.forEach((resolve) => resolve(renderer))
}

export async function waitForDiagramViewRenderer(
  rendererId: string
): Promise<PixiGraphRenderer | null> {
  await nextTick()
  const existing = getDiagramViewRenderer(rendererId)
  if (existing) {
    await existing._initPromise
    return getDiagramViewRenderer(rendererId)
  }

  return new Promise((resolve) => {
    const list = readyWaiters.get(rendererId) ?? []
    list.push(resolve)
    readyWaiters.set(rendererId, list)
    window.setTimeout(() => {
      const waiters = readyWaiters.get(rendererId)
      if (!waiters?.includes(resolve)) return
      readyWaiters.set(
        rendererId,
        waiters.filter((waiter) => waiter !== resolve)
      )
      resolve(getDiagramViewRenderer(rendererId))
    }, 8000)
  })
}
