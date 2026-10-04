<template>
  <div
    ref="containerRef"
    class="state-machine-ring-view"
    :class="{ 'state-machine-ring-view--fill': fillContainer }"
  >
    <div ref="stageHostRef" class="state-machine-ring-view__stage" />
    <div v-if="!fillContainer" class="state-machine-ring-view__hint">
      Scroll to zoom · middle-drag to pan · double-click to fit
    </div>
  </div>
</template>

<script setup lang="ts">
import { Application, Container, Graphics, Rectangle } from 'pixi.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { StateMachineRingPresentation } from '../utils/graph/DiagramConversion'
import { paintStateMachineRing, type StateMachineRingSimHighlight } from '../utils/graph/DiagramPixiPainter'
import { parseColor, parseColorAlpha } from '../utils/graph/ConnectionPixiPainter'
import { DIAGRAM_STAGE_BG } from '../utils/graph/diagramDotGrid'
import { createPixiDotGrid, type PixiDotGrid } from '../utils/graph/diagramDotGridPixi'
import { ensureDiagramBitmapFont } from '../utils/graph/pixiText'

const props = withDefaults(
  defineProps<{
    presentation: StateMachineRingPresentation
    /** Fill parent height (lens / app window). Default: compact panel in sidebar. */
    fillContainer?: boolean
    simHighlight?: StateMachineRingSimHighlight | null
  }>(),
  { fillContainer: false, simHighlight: null }
)

const containerRef = ref<HTMLDivElement | null>(null)
const stageHostRef = ref<HTMLDivElement | null>(null)

let app: Application | null = null
let world: Container | null = null
let dotGrid: PixiDotGrid | null = null
let buildGeneration = 0
let initAborted = false
let resizeObserver: ResizeObserver | null = null
let suppressMiddleClick: ((e: MouseEvent) => void) | null = null
let wheelHandler: ((e: WheelEvent) => void) | null = null
let dblClickHandler: ((e: MouseEvent) => void) | null = null
let panMouseDown: ((e: MouseEvent) => void) | null = null
let panMouseMove: ((e: MouseEvent) => void) | null = null
let panMouseUp: ((e: MouseEvent) => void) | null = null
let panMouseLeave: (() => void) | null = null
let panContextMenu: ((e: MouseEvent) => void) | null = null

const view = { scale: 1, panX: 0, panY: 0 }
let panSession: {
  startPointer: { x: number; y: number }
  startPan: { x: number; y: number }
} | null = null
let lastMiddleDownAt = 0
let userTransformed = false

const MIN_SCALE = 0.12
const MAX_SCALE = 4
const VIEWPORT_PADDING = 10

const getViewportSize = (): { width: number; height: number } => {
  const container = containerRef.value
  const host = stageHostRef.value
  if (!container) {
    return { width: 320, height: 280 }
  }

  const width = Math.max(160, container.clientWidth)

  if (props.fillContainer) {
    const height = Math.max(120, host?.clientHeight ?? container.clientHeight)
    return { width, height }
  }

  const aspect = props.presentation.height / Math.max(props.presentation.width, 1)
  const height = Math.max(200, Math.min(440, Math.round(width * aspect)))
  return { width, height }
}

const getPointerInCanvas = (clientX: number, clientY: number): { x: number; y: number } | null => {
  const canvas = app?.canvas as HTMLCanvasElement | undefined
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  return { x: clientX - rect.left, y: clientY - rect.top }
}

const applyView = () => {
  if (!world || !app) return
  world.scale.set(view.scale)
  world.position.set(view.panX, view.panY)
  dotGrid?.sync(view.panX, view.panY, view.scale)
  app.render()
}

const fitToViewport = () => {
  if (!app) return
  const width = app.renderer.width
  const height = app.renderer.height
  const contentW = props.presentation.width
  const contentH = props.presentation.height
  const scale = Math.min(
    (width - VIEWPORT_PADDING * 2) / contentW,
    (height - VIEWPORT_PADDING * 2) / contentH
  )
  view.scale = scale
  view.panX = (width - contentW * scale) / 2
  view.panY = (height - contentH * scale) / 2
  applyView()
}

const endPan = () => {
  panSession = null
  if (stageHostRef.value) {
    stageHostRef.value.style.cursor = 'default'
  }
}

const removeCanvasListeners = (canvas: HTMLCanvasElement) => {
  if (wheelHandler) canvas.removeEventListener('wheel', wheelHandler)
  if (dblClickHandler) canvas.removeEventListener('dblclick', dblClickHandler)
  if (panMouseDown) canvas.removeEventListener('mousedown', panMouseDown)
  if (panMouseMove) canvas.removeEventListener('mousemove', panMouseMove)
  if (panMouseUp) canvas.removeEventListener('mouseup', panMouseUp)
  if (panMouseLeave) canvas.removeEventListener('mouseleave', panMouseLeave)
  if (panContextMenu) canvas.removeEventListener('contextmenu', panContextMenu)
  wheelHandler = null
  dblClickHandler = null
  panMouseDown = null
  panMouseMove = null
  panMouseUp = null
  panMouseLeave = null
  panContextMenu = null
}

const setupCanvasHandlers = (canvas: HTMLCanvasElement) => {
  panMouseDown = (evt) => {
    if (evt.button !== 1) return
    evt.preventDefault()
    lastMiddleDownAt = Date.now()
    const pointer = getPointerInCanvas(evt.clientX, evt.clientY)
    if (!pointer) return
    if (stageHostRef.value) stageHostRef.value.style.cursor = 'grabbing'
    panSession = {
      startPointer: { x: pointer.x, y: pointer.y },
      startPan: { x: view.panX, y: view.panY },
    }
  }

  panMouseMove = (evt) => {
    if (!panSession) return
    const pointer = getPointerInCanvas(evt.clientX, evt.clientY)
    if (!pointer) return
    const dx = pointer.x - panSession.startPointer.x
    const dy = pointer.y - panSession.startPointer.y
    view.panX = panSession.startPan.x + dx
    view.panY = panSession.startPan.y + dy
    userTransformed = true
    applyView()
  }

  panMouseUp = (evt) => {
    if (evt.button === 1 || panSession) endPan()
  }

  panMouseLeave = () => {
    if (panSession) endPan()
  }

  panContextMenu = (evt) => {
    if (evt.button === 1) evt.preventDefault()
  }

  wheelHandler = (evt) => {
    evt.preventDefault()
    const pointer = getPointerInCanvas(evt.clientX, evt.clientY)
    if (!pointer) return
    const oldScale = view.scale
    const scaleFactor = evt.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale * scaleFactor))
    const mousePointTo = {
      x: (pointer.x - view.panX) / oldScale,
      y: (pointer.y - view.panY) / oldScale,
    }
    view.scale = newScale
    view.panX = pointer.x - mousePointTo.x * newScale
    view.panY = pointer.y - mousePointTo.y * newScale
    userTransformed = true
    applyView()
  }

  dblClickHandler = (evt) => {
    if (evt.button === 1 || Date.now() - lastMiddleDownAt < 400) return
    evt.preventDefault()
    userTransformed = false
    fitToViewport()
  }

  canvas.addEventListener('wheel', wheelHandler, { passive: false })
  canvas.addEventListener('dblclick', dblClickHandler)
  canvas.addEventListener('mousedown', panMouseDown)
  canvas.addEventListener('mousemove', panMouseMove)
  canvas.addEventListener('mouseup', panMouseUp)
  canvas.addEventListener('mouseleave', panMouseLeave)
  canvas.addEventListener('contextmenu', panContextMenu)
}

const syncStageSize = (fit = false) => {
  const container = containerRef.value
  const host = stageHostRef.value
  if (!container || !host || !app) return

  const { width, height } = getViewportSize()

  if (props.fillContainer) {
    host.style.height = ''
  } else {
    host.style.height = `${height}px`
  }

  const prevWidth = app.renderer.width
  const prevHeight = app.renderer.height
  if (width !== prevWidth || height !== prevHeight) {
    void app.renderer.resize(width, height)
    app.stage.hitArea = new Rectangle(0, 0, width, height)
    dotGrid?.resize(width, height)
  }

  if (fit || !userTransformed) {
    userTransformed = false
    fitToViewport()
  } else {
    applyView()
  }
}

const updateStageSize = (fit = false) => {
  syncStageSize(fit)
}

const destroyStage = () => {
  initAborted = true
  endPan()
  const host = stageHostRef.value
  if (host && suppressMiddleClick) {
    host.removeEventListener('mousedown', suppressMiddleClick)
  }
  suppressMiddleClick = null
  dotGrid?.destroy()
  dotGrid = null
  if (app) {
    const canvas = app.canvas as HTMLCanvasElement
    removeCanvasListeners(canvas)
    // CRITICAL: do not use destroy(true, …) — boolean true releases GlobalResourceRegistry
    // / TexturePool shared with the main graph and crashes its Text nodes.
    app.destroy({ removeView: true }, { children: true })
    app = null
  }
  world = null
  if (host) {
    host.innerHTML = ''
  }
}

const buildStage = async () => {
  const container = containerRef.value
  const host = stageHostRef.value
  if (!container || !host) return

  destroyStage()
  initAborted = false
  const generation = ++buildGeneration
  host.innerHTML = ''

  if (props.fillContainer) {
    host.style.height = ''
  }

  const { width, height } = getViewportSize()
  if (!props.fillContainer) {
    host.style.height = `${height}px`
  }

  const nextApp = new Application()
  try {
    await nextApp.init({
      width,
      height,
      background: DIAGRAM_STAGE_BG,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })
  } catch {
    return
  }

  if (initAborted || generation !== buildGeneration) {
    nextApp.destroy({ removeView: true }, { children: true })
    return
  }

  app = nextApp
  await ensureDiagramBitmapFont()
  host.appendChild(app.canvas as HTMLCanvasElement)
  const canvas = app.canvas as HTMLCanvasElement
  canvas.style.display = 'block'
  canvas.style.backgroundColor = DIAGRAM_STAGE_BG

  dotGrid = createPixiDotGrid(() => app?.render())
  dotGrid.resize(width, height)
  app.stage.addChild(dotGrid.root)

  world = new Container()
  app.stage.addChild(world)
  app.stage.eventMode = 'static'
  app.stage.hitArea = new Rectangle(0, 0, width, height)

  const contentGroup = new Container()
  contentGroup.eventMode = 'none'
  world.addChild(contentGroup)

  const { width: contentW, height: contentH } = props.presentation
  const backdrop = new Graphics()
  backdrop.label = 'sm-ring-backdrop'
  backdrop.eventMode = 'none'
  backdrop.roundRect(0, 0, contentW, contentH, 8)
  backdrop.fill({ color: parseColor('#1e2430'), alpha: 1 })
  backdrop.stroke({
    width: 1,
    color: parseColor('#5a9fd4'),
    alpha: parseColorAlpha('#5a9fd4', 1),
  })
  contentGroup.addChild(backdrop)

  paintStateMachineRing(contentGroup, props.presentation, props.simHighlight)

  setupCanvasHandlers(app.canvas as HTMLCanvasElement)

  suppressMiddleClick = (e: MouseEvent) => {
    if (e.button === 1) e.preventDefault()
  }
  host.addEventListener('mousedown', suppressMiddleClick)

  userTransformed = false
  fitToViewport()
}

onMounted(() => {
  void buildStage()
  const container = containerRef.value
  if (!container) return

  let resizeRaf = 0
  resizeObserver = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf)
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0
      updateStageSize(!userTransformed)
    })
  })
  resizeObserver.observe(container)
  if (stageHostRef.value) {
    resizeObserver.observe(stageHostRef.value)
  }

  requestAnimationFrame(() => updateStageSize(true))
})

watch(
  () => props.presentation,
  () => {
    userTransformed = false
    void buildStage()
  },
  { deep: true }
)

watch(
  () => props.simHighlight,
  () => {
    void buildStage()
  },
  { deep: true }
)

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  destroyStage()
})

defineExpose({
  fitView: () => {
    userTransformed = false
    fitToViewport()
  },
})
</script>

<style scoped>
.state-machine-ring-view {
  width: 100%;
}

.state-machine-ring-view--fill {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.state-machine-ring-view--fill .state-machine-ring-view__stage {
  flex: 1;
  min-height: 0;
}

.state-machine-ring-view__stage {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  cursor: default;
  background: #1a1a1a;
  border: 1px solid #3a4a5a;
}

.state-machine-ring-view__hint {
  margin-top: 6px;
  font-size: 10px;
  color: #6a7a8a;
  text-align: center;
}
</style>
