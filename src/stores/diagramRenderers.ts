import { nextTick, ref, shallowRef, watch } from 'vue'
import type { PixiGraphRenderer } from '../utils/PixiGraphRenderer'
import { currentView } from './bodyViews'
import { activeDiagramId } from './graphProject'
import { windows } from './appWindows'
import { getWindowStackTop } from './windowStacks'

/** Stable id for the active Main Pixi canvas (legacy callers). */
export const MAIN_RENDERER_ID = 'main'

export type FocusedDiagramSurface =
  | { kind: 'body' }
  | { kind: 'window'; windowId: string }

/** Which host currently has keyboard focus: body area or a window. */
export const focusedDiagramSurface = ref<FocusedDiagramSurface | null>(null)

/** Last diagram host that had focus — kept when chrome (menu, tools) steals keyboard focus. */
const lastFocusedDiagramSurface = ref<FocusedDiagramSurface | null>(null)

watch(focusedDiagramSurface, (surface) => {
  if (surface) lastFocusedDiagramSurface.value = surface
})

function isStateLinksRootSurface(surface: FocusedDiagramSurface | null): boolean {
  if (surface?.kind !== 'window') return false
  const win = windows.value.find((w) => w.id === surface.windowId)
  if (!win || win.minimized || win.type !== 'state-links') return false
  return getWindowStackTop(surface.windowId)?.kind === 'state-links'
}

/**
 * State-links window on its root view: select + open children only (no move/resize/wires).
 */
export function isStateLinksRootViewFocused(): boolean {
  return isStateLinksRootSurface(focusedDiagramSurface.value)
}

/** Same as focused, but still true after focus leaves the window for the menubar / tools. */
export function isStateLinksRootContext(): boolean {
  return isStateLinksRootSurface(focusedDiagramSurface.value ?? lastFocusedDiagramSurface.value)
}

export type DiagramRendererApi = {
  fitView?: () => void
  presentDefault?: () => void
  getRenderer: () => PixiGraphRenderer | null
  focusCanvas?: () => void
}

const viewApis = new Map<string, DiagramRendererApi>()
const readyWaiters = new Map<string, Array<(renderer: PixiGraphRenderer | null) => void>>()

/** One Main Pixi instance per project diagram — soft-switch suspends, does not destroy. */
const mainRenderersByDiagram = new Map<string, PixiGraphRenderer>()

/** Active diagram's Main canvas Pixi instance — owned by App mount/destroy. */
export const mainDiagramRenderer = shallowRef<PixiGraphRenderer | null>(null)

export function getMainRendererForDiagram(diagramId: string): PixiGraphRenderer | null {
  return mainRenderersByDiagram.get(diagramId) ?? null
}

export function setMainRendererForDiagram(diagramId: string, renderer: PixiGraphRenderer | null) {
  const prev = mainRenderersByDiagram.get(diagramId)
  if (renderer) {
    mainRenderersByDiagram.set(diagramId, renderer)
  } else {
    mainRenderersByDiagram.delete(diagramId)
  }
  if (activeDiagramId.value === diagramId || mainDiagramRenderer.value === prev) {
    mainDiagramRenderer.value = renderer
  }
}

/** Point the legacy mainDiagramRenderer ref at diagramId and suspend other mains. */
export function activateMainRenderer(diagramId: string) {
  for (const [id, renderer] of mainRenderersByDiagram) {
    renderer.setSuspended(id !== diagramId)
  }
  mainDiagramRenderer.value = mainRenderersByDiagram.get(diagramId) ?? null
}

export function destroyAllMainDiagramRenderers() {
  for (const renderer of mainRenderersByDiagram.values()) {
    renderer.destroy()
  }
  mainRenderersByDiagram.clear()
  mainDiagramRenderer.value = null
}

/** @deprecated Prefer setMainRendererForDiagram(activeId, …) */
export function setMainDiagramRenderer(renderer: PixiGraphRenderer | null) {
  const id = activeDiagramId.value
  if (!id) {
    mainDiagramRenderer.value = renderer
    return
  }
  setMainRendererForDiagram(id, renderer)
}

export function registerDiagramView(id: string, api: DiagramRendererApi | null) {
  if (!api) {
    viewApis.delete(id)
    return
  }
  viewApis.set(id, api)
}

export function getDiagramViewApi(id: string): DiagramRendererApi | null {
  if (id === MAIN_RENDERER_ID) {
    const main = mainDiagramRenderer.value
    if (!main) return null
    return { getRenderer: () => mainDiagramRenderer.value }
  }
  return viewApis.get(id) ?? null
}

export function getDiagramViewRenderer(id: string): PixiGraphRenderer | null {
  if (id === MAIN_RENDERER_ID) return mainDiagramRenderer.value
  return viewApis.get(id)?.getRenderer() ?? null
}

export function forEachDiagramViewApi(fn: (api: DiagramRendererApi, id: string) => void) {
  if (mainDiagramRenderer.value) {
    fn({ getRenderer: () => mainDiagramRenderer.value }, MAIN_RENDERER_ID)
  }
  viewApis.forEach((api, id) => fn(api, id))
}

export function forEachDiagramViewRenderer(fn: (renderer: PixiGraphRenderer, id: string) => void) {
  forEachDiagramViewApi((api, id) => {
    const renderer = api.getRenderer()
    if (renderer) fn(renderer, id)
  })
}

/** All Main canvases (including soft-suspended diagrams). */
export function forEachMainDiagramRenderer(
  fn: (renderer: PixiGraphRenderer, diagramId: string) => void
) {
  for (const [diagramId, renderer] of mainRenderersByDiagram) {
    fn(renderer, diagramId)
  }
}

/** Active diagram renderer for the focused host (body stack top, or focused window). */
export function getActiveDiagramRenderer(): PixiGraphRenderer | null {
  const surface = focusedDiagramSurface.value
  if (surface?.kind === 'window') {
    return getDiagramViewRenderer(surface.windowId)
  }
  const top = currentView.value
  if (top.kind === 'graph-scope' || top.kind === 'state-links') {
    return getDiagramViewRenderer(top.id)
  }
  if (top.kind === 'sm-ring') return null
  return mainDiagramRenderer.value
}

export function syncBodyRendererActivity() {
  const top = currentView.value
  const topId = top.kind === 'main' ? null : top.id
  const stacked = top.kind !== 'main'

  const activeDiagram = activeDiagramId.value
  for (const [diagramId, renderer] of mainRenderersByDiagram) {
    if (diagramId !== activeDiagram) {
      renderer.setSuspended(true)
    } else {
      renderer.setSuspended(stacked)
    }
  }

  viewApis.forEach((api, viewId) => {
    const renderer = api.getRenderer()
    if (!renderer) return
    // Windows stay active for their host; body lenses only when they are the active top.
    if (viewId.startsWith('win_')) return
    renderer.setSuspended(viewId !== topId)
  })
}

export function notifyDiagramViewReady(id: string) {
  const renderer = getDiagramViewRenderer(id)
  const waiters = readyWaiters.get(id)
  if (!waiters?.length) return
  readyWaiters.delete(id)
  waiters.forEach((resolve) => resolve(renderer))
}

export async function waitForDiagramViewRenderer(
  id: string
): Promise<PixiGraphRenderer | null> {
  await nextTick()
  const existing = getDiagramViewRenderer(id)
  if (existing) {
    await existing._initPromise
    return getDiagramViewRenderer(id)
  }

  return new Promise((resolve) => {
    const list = readyWaiters.get(id) ?? []
    list.push(resolve)
    readyWaiters.set(id, list)
    window.setTimeout(() => {
      const waiters = readyWaiters.get(id)
      if (!waiters?.includes(resolve)) return
      readyWaiters.set(
        id,
        waiters.filter((waiter) => waiter !== resolve)
      )
      resolve(getDiagramViewRenderer(id))
    }, 8000)
  })
}

/** Vue ref callback helper for lens / window content components. */
export function bindDiagramViewRef(id: string, el: unknown) {
  if (el && typeof el === 'object' && el !== null && 'getRenderer' in el) {
    registerDiagramView(id, el as DiagramRendererApi)
    return
  }
  // SM ring (and similar) expose fitView only — no Pixi diagram renderer.
  if (el && typeof el === 'object' && el !== null && 'fitView' in el) {
    const exposed = el as Omit<DiagramRendererApi, 'getRenderer'>
    registerDiagramView(id, {
      fitView: exposed.fitView,
      presentDefault: exposed.presentDefault,
      focusCanvas: exposed.focusCanvas,
      getRenderer: () => null,
    })
    return
  }
  registerDiagramView(id, null)
}
