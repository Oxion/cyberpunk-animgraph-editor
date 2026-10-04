import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export type SidebarPanelId = 'graphInfo' | 'sim' | 'tools' | 'details'

export type SidebarPanelVisibility = Record<SidebarPanelId, boolean>

export const SIDEBAR_MIN_WIDTH = 280
export const SIDEBAR_DEFAULT_WIDTH = 480
export const SIDEBAR_EDGE_OFFSET = 12
const SIDEBAR_PANEL_HEADER = 32
const SIDEBAR_CARDS_GAP = 8

export const SIDEBAR_PANEL_MIN: Record<SidebarPanelId, number> = {
  graphInfo: 120,
  sim: 160,
  tools: 200,
  details: 160,
}

type SidebarPanelLayout = {
  id: SidebarPanelId
  visible: boolean
  collapsed: boolean
  height: number
  minHeight: number
}

export function useSidebarLayout(options: {
  getContainerWidth: () => number
  visibility: MaybeRefOrGetter<SidebarPanelVisibility>
  chromeBarVisible?: MaybeRefOrGetter<boolean>
  /** Stretch the only expanded card (node details while a node is selected). */
  fillSinglePanel?: MaybeRefOrGetter<boolean>
}) {
  const sidebarWidth = ref(SIDEBAR_DEFAULT_WIDTH)
  const sidebarVisible = ref(true)
  const sidebarResizing = ref(false)

  let sidebarResizePointerId: number | null = null
  let sidebarResizeStart = { pointerX: 0, width: 0 }

  const clampSidebarWidth = (width: number) => {
    const containerWidth = options.getContainerWidth()
    const maxWidth = Math.max(SIDEBAR_MIN_WIDTH, containerWidth - SIDEBAR_EDGE_OFFSET * 2)
    return Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, width))
  }

  const sidebarStyle = computed(() => ({
    '--sidebar-width': `${clampSidebarWidth(sidebarWidth.value)}px`,
  }))

  const endSidebarResize = (e: PointerEvent) => {
    if (sidebarResizePointerId !== e.pointerId) return
    sidebarResizePointerId = null
    sidebarResizing.value = false
    document.removeEventListener('pointermove', onSidebarResizeMove)
    document.removeEventListener('pointerup', endSidebarResize)
    document.removeEventListener('pointercancel', endSidebarResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const onSidebarResizeMove = (e: PointerEvent) => {
    if (sidebarResizePointerId !== e.pointerId) return
    const delta = sidebarResizeStart.pointerX - e.clientX
    sidebarWidth.value = clampSidebarWidth(sidebarResizeStart.width + delta)
  }

  const onSidebarResizeStart = (e: PointerEvent) => {
    if (window.matchMedia('(max-width: 768px)').matches) return
    e.preventDefault()
    sidebarResizePointerId = e.pointerId
    sidebarResizing.value = true
    sidebarResizeStart = { pointerX: e.clientX, width: sidebarWidth.value }
    document.addEventListener('pointermove', onSidebarResizeMove)
    document.addEventListener('pointerup', endSidebarResize)
    document.addEventListener('pointercancel', endSidebarResize)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  const onWindowResize = () => {
    sidebarWidth.value = clampSidebarWidth(sidebarWidth.value)
  }

  const sidebarElRef = ref<HTMLElement | null>(null)
  const sidebarCardsElRef = ref<HTMLElement | null>(null)
  const sidebarCardsHeight = ref(0)
  const chromeBarReserve = () =>
    toValue(options.chromeBarVisible)
      ? SIDEBAR_PANEL_HEADER + SIDEBAR_CARDS_GAP
      : 0

  const graphInfoPanelCollapsed = ref(false)
  const graphInfoPanelHeight = ref(140)
  const simPanelCollapsed = ref(false)
  const simPanelHeight = ref(320)
  const toolsPanelCollapsed = ref(false)
  const toolsPanelHeight = ref(280)
  const detailsPanelCollapsed = ref(false)
  const detailsPanelHeight = ref(320)

  const getSidebarPanelLayouts = (): SidebarPanelLayout[] => {
    const visibility = toValue(options.visibility)
    return [
      {
        id: 'graphInfo',
        visible: visibility.graphInfo,
        collapsed: graphInfoPanelCollapsed.value,
        height: graphInfoPanelHeight.value,
        minHeight: SIDEBAR_PANEL_MIN.graphInfo,
      },
      {
        id: 'sim',
        visible: visibility.sim,
        collapsed: simPanelCollapsed.value,
        height: simPanelHeight.value,
        minHeight: SIDEBAR_PANEL_MIN.sim,
      },
      {
        id: 'tools',
        visible: visibility.tools,
        collapsed: toolsPanelCollapsed.value,
        height: toolsPanelHeight.value,
        minHeight: SIDEBAR_PANEL_MIN.tools,
      },
      {
        id: 'details',
        visible: visibility.details,
        collapsed: detailsPanelCollapsed.value,
        height: detailsPanelHeight.value,
        minHeight: SIDEBAR_PANEL_MIN.details,
      },
    ]
  }

  const setSidebarPanelHeight = (id: SidebarPanelId, height: number) => {
    switch (id) {
      case 'graphInfo':
        graphInfoPanelHeight.value = height
        break
      case 'sim':
        simPanelHeight.value = height
        break
      case 'tools':
        toolsPanelHeight.value = height
        break
      case 'details':
        detailsPanelHeight.value = height
        break
    }
  }

  /** Last expanded card fills leftover space when a node is selected or 2+ cards are open. */
  const sidebarFillPanelId = computed<SidebarPanelId | null>(() => {
    const panels = getSidebarPanelLayouts()
    const visible = panels.filter((panel) => panel.visible)
    const fillSingle = toValue(options.fillSinglePanel) ?? false
    if (visible.length < 2 && !fillSingle) return null
    for (let i = visible.length - 1; i >= 0; i -= 1) {
      const panel = visible[i]
      if (!panel.collapsed) return panel.id
    }
    return null
  })

  const sidebarPanelMaxHeights = computed<Record<SidebarPanelId, number>>(() => {
    const available = sidebarCardsHeight.value - chromeBarReserve()
    const fillId = sidebarFillPanelId.value
    const panels = getSidebarPanelLayouts()
    const visible = panels.filter((panel) => panel.visible)
    const gaps = Math.max(0, visible.length - 1) * SIDEBAR_CARDS_GAP
    const fallback = 1200

    const result = { ...SIDEBAR_PANEL_MIN } as Record<SidebarPanelId, number>
    for (const panel of panels) {
      result[panel.id] = Math.max(panel.minHeight, fallback)
    }
    if (available <= 0) return result

    for (const panel of visible) {
      if (panel.collapsed) {
        result[panel.id] = panel.minHeight
        continue
      }
      // Fill panel grows via flex; resize handle is hidden.
      if (panel.id === fillId) {
        result[panel.id] = panel.minHeight
        continue
      }

      let reserved = gaps
      for (const other of visible) {
        if (other.id === panel.id) continue
        if (other.collapsed) {
          reserved += SIDEBAR_PANEL_HEADER
        } else if (other.id === fillId) {
          reserved += other.minHeight
        } else {
          reserved += Math.max(other.minHeight, other.height)
        }
      }
      result[panel.id] = Math.max(panel.minHeight, available - reserved)
    }
    return result
  })

  const clampSidebarPanelHeights = () => {
    const available = sidebarCardsHeight.value - chromeBarReserve()
    if (available <= 0) return

    const fillId = sidebarFillPanelId.value
    const panels = getSidebarPanelLayouts()
    const visible = panels.filter((panel) => panel.visible)
    if (visible.length === 0) return

    const gaps = Math.max(0, visible.length - 1) * SIDEBAR_CARDS_GAP
    let collapsedSum = 0
    let fillMin = 0
    const fixed: SidebarPanelLayout[] = []

    for (const panel of visible) {
      if (panel.collapsed) {
        collapsedSum += SIDEBAR_PANEL_HEADER
      } else if (panel.id === fillId) {
        fillMin = panel.minHeight
      } else {
        fixed.push(panel)
      }
    }

    const budget = available - gaps - collapsedSum - fillMin
    const heights = new Map<SidebarPanelId, number>()
    for (const panel of fixed) {
      heights.set(panel.id, Math.max(panel.minHeight, panel.height))
    }

    const fixedTotal = () =>
      fixed.reduce((sum, panel) => sum + (heights.get(panel.id) ?? panel.minHeight), 0)

    while (fixedTotal() > budget + 0.5) {
      let target: SidebarPanelLayout | null = null
      let reducible = 0
      for (const panel of fixed) {
        const current = heights.get(panel.id) ?? panel.minHeight
        const extra = current - panel.minHeight
        if (extra > reducible) {
          reducible = extra
          target = panel
        }
      }
      if (!target || reducible <= 0) break
      const overflow = fixedTotal() - budget
      const current = heights.get(target.id) ?? target.minHeight
      heights.set(target.id, current - Math.min(reducible, overflow))
    }

    for (const panel of fixed) {
      const next = heights.get(panel.id)
      if (next !== undefined && next !== panel.height) {
        setSidebarPanelHeight(panel.id, next)
      }
    }
  }

  let sidebarCardsObserver: ResizeObserver | null = null

  watch(sidebarCardsElRef, (el) => {
    sidebarCardsObserver?.disconnect()
    sidebarCardsObserver = null
    if (!el) {
      sidebarCardsHeight.value = 0
      return
    }
    const update = () => {
      sidebarCardsHeight.value = el.clientHeight
      clampSidebarPanelHeights()
    }
    sidebarCardsObserver = new ResizeObserver(update)
    sidebarCardsObserver.observe(el)
    update()
  })

  watch(
    () => toValue(options.chromeBarVisible),
    () => clampSidebarPanelHeights()
  )

  const dispose = () => {
    sidebarCardsObserver?.disconnect()
    sidebarCardsObserver = null
    document.removeEventListener('pointermove', onSidebarResizeMove)
    document.removeEventListener('pointerup', endSidebarResize)
    document.removeEventListener('pointercancel', endSidebarResize)
  }

  onUnmounted(dispose)

  return {
    SIDEBAR_PANEL_MIN,
    sidebarWidth,
    sidebarVisible,
    sidebarResizing,
    sidebarStyle,
    sidebarElRef,
    sidebarCardsElRef,
    graphInfoPanelCollapsed,
    graphInfoPanelHeight,
    simPanelCollapsed,
    simPanelHeight,
    toolsPanelCollapsed,
    toolsPanelHeight,
    detailsPanelCollapsed,
    detailsPanelHeight,
    sidebarFillPanelId,
    sidebarPanelMaxHeights,
    onSidebarResizeStart,
    onWindowResize,
    dispose,
  }
}
