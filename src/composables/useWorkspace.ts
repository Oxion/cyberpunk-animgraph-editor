import { computed, watch } from 'vue'
import { bodyViewTop, type DiagramBodyView } from '../types/DiagramBodyView'
import {
  activateBodyView,
  activeBodyViewId,
  bodyBelongsToDiagram,
  bodyViews,
  bodyViewRoot,
} from '../stores/bodyViews'
import {
  activeDiagramId,
  hasDiagramId,
  setActiveDiagramId,
} from '../stores/graphProject'
import { presentActiveDiagram } from '../stores/projectViewSession'

function bodyTaskbarTitle(view: DiagramBodyView): string {
  const base = bodyViewTop(view).title
  return view.preview ? `Preview · ${base}` : base
}

/**
 * Pairs active diagram with active body.
 * Structural body sync / mount is owned by projectViewSession (explicit intents).
 */
export function useWorkspace() {
  watch(activeDiagramId, (diagramId) => {
    if (!diagramId) return
    const current = bodyViews.value.find((v) => v.id === activeBodyViewId.value)
    if (current && bodyBelongsToDiagram(current, diagramId)) return
    const root = bodyViews.value.find((v) => !v.closable && v.id === diagramId)
    if (!root) return
    activateBodyView(root.id)
  })

  watch(activeBodyViewId, (bodyId) => {
    const body = bodyViews.value.find((v) => v.id === bodyId)
    if (!body) return
    const diagramId = bodyViewRoot(body).projectDiagramId
    if (!diagramId || !hasDiagramId(diagramId)) return
    if (activeDiagramId.value === diagramId) return
    setActiveDiagramId(diagramId)
    presentActiveDiagram(diagramId)
  })

  const bodyViewTaskbarItems = computed(() => {
    const diagramId = activeDiagramId.value
    if (!diagramId) return []

    const root = bodyViews.value.find((v) => !v.closable && v.id === diagramId)
    const parallels = bodyViews.value.filter(
      (v) => v.closable && bodyBelongsToDiagram(v, diagramId)
    )
    const items: Array<{
      id: string
      title: string
      type: string
      minimized: boolean
      active: boolean
      preview?: boolean
    }> = []

    if (root && parallels.length > 0) {
      items.push({
        id: root.id,
        title: bodyViewRoot(root).title,
        type: 'body-main',
        minimized: activeBodyViewId.value !== root.id,
        active: activeBodyViewId.value === root.id,
        preview: false,
      })
    }

    for (const v of parallels) {
      items.push({
        id: v.id,
        title: bodyTaskbarTitle(v),
        type: 'body-view',
        minimized: v.minimized || activeBodyViewId.value !== v.id,
        active: activeBodyViewId.value === v.id && !v.minimized,
        preview: v.preview,
      })
    }

    return items
  })

  return { bodyViewTaskbarItems }
}
