import { computed, ref } from 'vue'
import type {
  DiagramBodySurface,
  DiagramBodyView,
  FlatBodyView,
  OpenParallelBodyOptions,
  StackableBodyView,
} from '../types/DiagramBodyView'
import { isStackableBodyView } from '../types/DiagramBodyView'

let parallelSeq = 0

function cloneBodyView(view: DiagramBodyView): DiagramBodyView {
  return { ...view }
}

function cloneBodyViews(views: DiagramBodyView[]): DiagramBodyView[] {
  return views.map(cloneBodyView)
}

function firstNonClosableId(): string | null {
  return bodyViews.value.find((v) => !v.closable)?.id ?? null
}

function pickPreferredBodyId(rootIds: string[], preferActiveId?: string | null): string {
  const idSet = new Set(rootIds)
  if (preferActiveId && idSet.has(preferActiveId)) return preferActiveId
  return rootIds[0] ?? firstNonClosableId() ?? ''
}

/** Permanent non-closable body. */
export function isDiagramRootBodyId(id: string): boolean {
  const view = bodyViews.value.find((v) => v.id === id)
  return Boolean(view && !view.closable)
}

export function isDiagramRootBody(view: DiagramBodyView): boolean {
  return !view.closable
}

/**
 * Soft sync non-closable bodies: reuse existing roots with matching ids (keeps content).
 * Preserves closable parallels whose ids are not in the new root set.
 */
export function syncNonClosableBodies(
  roots: StackableBodyView[],
  preferActiveId?: string | null
) {
  const idSet = new Set(roots.map((r) => r.id))
  const closable = bodyViews.value.filter((v) => v.closable && !idSet.has(v.id))

  const nextRoots: StackableBodyView[] = roots.map((incoming) => {
    const existing = bodyViews.value.find((v) => v.id === incoming.id && !v.closable)
    if (existing && isStackableBodyView(existing)) {
      return existing
    }
    return incoming
  })

  bodyViews.value = nextRoots.length > 0 ? [...nextRoots, ...closable] : [...closable]

  if (nextRoots.length === 0) {
    activeBodyViewId.value =
      bodyViews.value.find((v) => v.closable && !v.minimized)?.id ??
      bodyViews.value[0]?.id ??
      ''
    return
  }

  activeBodyViewId.value = pickPreferredBodyId(
    nextRoots.map((r) => r.id),
    preferActiveId
  )
}

/** Hard replace non-closable bodies; drop all closable parallels. */
export function replaceNonClosableBodies(
  roots: StackableBodyView[],
  preferActiveId?: string | null
) {
  if (roots.length === 0) {
    bodyViews.value = []
    activeBodyViewId.value = ''
    return
  }

  bodyViews.value = roots.map(cloneBodyView)
  activeBodyViewId.value = pickPreferredBodyId(
    roots.map((r) => r.id),
    preferActiveId
  )
}

function createParallelBody(
  surface: DiagramBodySurface,
  preview: boolean
): DiagramBodyView {
  if (surface === 'stackable') {
    const stackable: StackableBodyView = {
      id: '',
      surface: 'stackable',
      closable: true,
      preview,
      minimized: false,
    }
    return stackable
  }
  const flat: FlatBodyView = {
    id: '',
    surface: 'flat',
    closable: true,
    preview,
    minimized: false,
  }
  return flat
}

export const bodyViews = ref<DiagramBodyView[]>([])

/** Which body surface owns the body area. */
export const activeBodyViewId = ref<string>('')

export const activeBodyView = computed((): DiagramBodyView | null => {
  const id = activeBodyViewId.value
  const found = bodyViews.value.find((v) => v.id === id && !v.minimized)
  if (found) return found
  return bodyViews.value.find((v) => !v.closable) ?? bodyViews.value[0] ?? null
})

/** Closable parallel body views. */
export const parallelBodyViews = computed(() => bodyViews.value.filter((v) => v.closable))

/** Permanent non-closable bodies. */
export const diagramRootBodies = computed(() => bodyViews.value.filter((v) => !v.closable))

export const activeParallelBodyView = computed(() => {
  const view = bodyViews.value.find((v) => v.id === activeBodyViewId.value)
  if (!view || view.minimized || !view.closable) return null
  return view
})

function findPreviewParallel(): DiagramBodyView | undefined {
  return (
    bodyViews.value.find((v) => v.closable && v.preview && !v.minimized) ??
    bodyViews.value.find((v) => v.closable && v.preview)
  )
}

function patchBodyView(id: string, patch: (view: DiagramBodyView) => void) {
  const next = cloneBodyViews(bodyViews.value)
  const view = next.find((v) => v.id === id)
  if (!view) return
  patch(view)
  bodyViews.value = next
}

function resolveBodyTargetId(bodyId: string): string | null {
  if (bodyViews.value.some((v) => v.id === bodyId)) return bodyId
  return firstNonClosableId()
}

/** Reveal a body and mark it active (chrome only). */
export function activateBodyContentHost(bodyId: string) {
  const targetId = resolveBodyTargetId(bodyId)
  if (!targetId) return
  patchBodyView(targetId, (view) => {
    view.minimized = false
  })
  activeBodyViewId.value = targetId
}

/** Open a closable parallel body chrome; caller assigns content via bodyContent. */
export const openParallelBody = (options: OpenParallelBodyOptions) => {
  const preview = options.preview !== false
  const surface = options.surface

  if (preview) {
    const existing = findPreviewParallel()
    if (existing) {
      const replacement = createParallelBody(surface, true)
      replacement.id = existing.id
      bodyViews.value = bodyViews.value.map((v) => (v.id === existing.id ? replacement : v))
      activeBodyViewId.value = existing.id
      return existing.id
    }
  }

  parallelSeq += 1
  const bodyId = `body_${surface}_${parallelSeq}_${Date.now()}`
  const body = createParallelBody(surface, preview)
  body.id = bodyId
  bodyViews.value = [...bodyViews.value, body]
  activeBodyViewId.value = bodyId
  return bodyId
}

export const closeBodyView = (id: string) => {
  const view = bodyViews.value.find((v) => v.id === id)
  if (!view || !view.closable) return
  bodyViews.value = bodyViews.value.filter((v) => v.id !== id)
  if (activeBodyViewId.value === id) {
    const next =
      bodyViews.value.find((v) => v.closable && !v.minimized) ??
      bodyViews.value.find((v) => !v.closable) ??
      null
    activeBodyViewId.value = next?.id ?? ''
  }
}

export const pinBodyView = (id: string) => {
  patchBodyView(id, (v) => {
    if (!v.preview) return
    v.preview = false
  })
}

export const activateBodyView = (id: string) => {
  const view = bodyViews.value.find((v) => v.id === id)
  if (!view) return
  const next = cloneBodyViews(bodyViews.value)
  const activatingRoot = !view.closable
  for (const v of next) {
    if (v.id === id) {
      v.minimized = false
    } else if (activatingRoot && v.closable) {
      v.minimized = true
    }
  }
  bodyViews.value = next
  activeBodyViewId.value = id
}

export const minimizeBodyView = (id: string) => {
  const view = bodyViews.value.find((v) => v.id === id)
  if (!view) return
  if (!view.closable) {
    const fallback = bodyViews.value.find((v) => !v.closable && v.id !== id)
    if (fallback) activeBodyViewId.value = fallback.id
    return
  }
  patchBodyView(id, (v) => {
    v.minimized = true
  })
  if (activeBodyViewId.value === id) {
    activeBodyViewId.value = firstNonClosableId() ?? ''
  }
}

export const toggleBodyView = (id: string) => {
  if (activeBodyViewId.value === id && bodyViews.value.find((v) => v.id === id)?.closable) {
    minimizeBodyView(id)
    return
  }
  activateBodyView(id)
}

export const clearParallelBodyViews = () => {
  bodyViews.value = bodyViews.value.filter((v) => !v.closable)
  if (!bodyViews.value.some((v) => v.id === activeBodyViewId.value)) {
    activeBodyViewId.value = firstNonClosableId() ?? ''
  }
}

export { firstNonClosableId }
