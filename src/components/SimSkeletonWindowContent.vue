<template>
  <div class="flex h-full min-h-0 flex-col gap-1.5 p-2">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Pose</span>
      <div class="flex flex-wrap gap-1">
        <button
          type="button"
          class="h-6 rounded-sm px-2 text-[11px]"
          :class="sourceBtnClass('full')"
          title="Root diagram Sample output (composed GraphSlots)"
          @click="poseSource = 'full'"
        >
          full
        </button>
        <button
          type="button"
          class="h-6 rounded-sm px-2 text-[11px]"
          :class="sourceBtnClass('active')"
          title="Currently open diagram Sample output"
          @click="poseSource = 'active'"
        >
          active
        </button>
        <button
          type="button"
          class="h-6 rounded-sm px-2 text-[11px]"
          :class="sourceBtnClass('atNode')"
          title="Pose captured at selected node (falls back to active)"
          @click="poseSource = 'atNode'"
        >
          at node
        </button>
      </div>
      <button
        type="button"
        class="h-6 rounded-sm px-2 text-[11px]"
        :class="
          showLabels
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-muted/60'
        "
        title="Toggle bone name labels (rig + procedural stack)"
        @click="toggleLabels"
      >
        labels
      </button>
      <span class="font-data truncate text-[10px] text-muted-foreground">
        {{ statusText }}
      </span>
    </div>
    <div
      ref="hostRef"
      class="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-border/60 bg-[#1a1b1e]"
      @keydown.esc.prevent="closePickMenu"
    >
      <div
        v-if="pickMenu"
        ref="pickMenuRef"
        class="absolute z-20 max-h-[200px] min-w-[120px] max-w-[240px] overflow-auto rounded-sm border border-border/70 bg-popover/95 p-0.5 shadow-md"
        :style="pickMenuStyle"
        role="menu"
        aria-label="Select bone"
      >
        <p
          class="m-0 px-1.5 pb-0.5 pt-1 text-[9px] uppercase tracking-wide text-muted-foreground"
        >
          Select bone ({{ pickMenu.candidates.length }})
        </p>
        <button
          v-for="c in pickMenu.candidates"
          :key="`${c.unifiedIndex}-${c.name}`"
          type="button"
          role="menuitem"
          class="block w-full truncate rounded-sm px-1.5 py-1 text-left font-data text-[11px] hover:bg-muted/80"
          :class="c.procedural ? 'text-fuchsia-300' : 'text-foreground'"
          :title="c.procedural ? `stack · ${c.name}` : c.name"
          @click.stop="chooseBone(c)"
        >
          {{ c.procedural ? `◈ ${c.name}` : c.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  createSkeletonView,
  type SkeletonBoneSelection,
  type SkeletonJointClick,
  type SkeletonView,
} from '../utils/sim/skeletonView'
import type { Pose } from '../utils/sim/pose'
import type { RigEntry } from '../utils/sim/rigResource'

export type SkeletonPoseSource = 'full' | 'active' | 'atNode'

type PickMenuState = {
  candidates: SkeletonBoneSelection[]
  x: number
  y: number
}

const props = defineProps<{
  diagramId: string
  minimized?: boolean
  getPose: (source: SkeletonPoseSource) => { pose: Pose; rig: RigEntry } | null
}>()

const hostRef = ref<HTMLElement | null>(null)
const pickMenuRef = ref<HTMLElement | null>(null)
const poseSource = ref<SkeletonPoseSource>('full')
const showLabels = ref(false)
const statusText = ref('No pose')
/** Prepared for app store — selected bone / stack slot name. */
const selectedBoneName = ref<string | null>(null)
const pickMenu = ref<PickMenuState | null>(null)
const pickMenuPos = ref({ x: 0, y: 0 })

let view: SkeletonView | null = null
let raf = 0
let resizeObs: ResizeObserver | null = null
let lastRig: RigEntry | null = null

const running = computed(() => !props.minimized)

const pickMenuStyle = computed(() => ({
  left: `${pickMenuPos.value.x}px`,
  top: `${pickMenuPos.value.y}px`,
}))

const sourceBtnClass = (s: SkeletonPoseSource) =>
  poseSource.value === s
    ? 'bg-secondary text-secondary-foreground'
    : 'text-muted-foreground hover:bg-muted/60'

const sourceLabel = (s: SkeletonPoseSource) => {
  if (s === 'full') return 'full'
  if (s === 'active') return 'active'
  return 'at node'
}

const toggleLabels = () => {
  showLabels.value = !showLabels.value
  view?.setShowLabels(showLabels.value)
}

const closePickMenu = () => {
  pickMenu.value = null
}

const clearBoneSelection = () => {
  selectedBoneName.value = null
  pickMenu.value = null
  view?.clearSelection()
}

const applyBoneSelection = (c: SkeletonBoneSelection) => {
  selectedBoneName.value = c.name
  pickMenu.value = null
  view?.selectBone(c.unifiedIndex)
}

const clampPickMenu = async () => {
  await nextTick()
  const host = hostRef.value
  const menu = pickMenuRef.value
  if (!host || !menu || !pickMenu.value) return
  const hw = host.clientWidth
  const hh = host.clientHeight
  const mw = menu.offsetWidth
  const mh = menu.offsetHeight
  pickMenuPos.value = {
    x: Math.min(Math.max(4, pickMenu.value.x), Math.max(4, hw - mw - 4)),
    y: Math.min(Math.max(4, pickMenu.value.y), Math.max(4, hh - mh - 4)),
  }
}

const onJointClick = (ev: SkeletonJointClick) => {
  const { candidates, x, y } = ev
  if (candidates.length === 0) {
    clearBoneSelection()
    return
  }
  if (candidates.length === 1) {
    applyBoneSelection(candidates[0]!)
    return
  }
  pickMenu.value = { candidates, x, y }
  pickMenuPos.value = { x, y }
  void clampPickMenu()
}

const chooseBone = (c: SkeletonBoneSelection) => {
  applyBoneSelection(c)
}

const tick = () => {
  raf = 0
  if (!view || !running.value) return
  const pack = props.getPose(poseSource.value)
  if (!pack) {
    statusText.value = 'No pose / rig'
    view.setRig(null)
    lastRig = null
    clearBoneSelection()
    view.render()
    raf = requestAnimationFrame(tick)
    return
  }
  if (pack.rig !== lastRig) {
    view.setRig(pack.rig)
    lastRig = pack.rig
    clearBoneSelection()
  }
  view.updateFromPose(pack.pose)
  const stackN = pack.pose.stackCount
  const base =
    stackN > 0
      ? `${sourceLabel(poseSource.value)} · ${pack.rig.boneNames.length}+${stackN} stack`
      : `${sourceLabel(poseSource.value)} · ${pack.rig.boneNames.length} bones`
  const sel = selectedBoneName.value
  const viewSel = view.getSelection()
  statusText.value = sel
    ? `${base} · ${viewSel?.procedural ? 'stack' : 'bone'} ${sel}`
    : base
  view.render()
  raf = requestAnimationFrame(tick)
}

const startLoop = () => {
  if (raf) return
  raf = requestAnimationFrame(tick)
}

const stopLoop = () => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

const onWindowKeydown = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') closePickMenu()
}

onMounted(() => {
  const host = hostRef.value
  if (!host) return
  view = createSkeletonView(host, { onJointClick })
  view.setSize(host.clientWidth, host.clientHeight)
  resizeObs = new ResizeObserver(() => {
    if (!view || !hostRef.value) return
    view.setSize(hostRef.value.clientWidth, hostRef.value.clientHeight)
  })
  resizeObs.observe(host)
  window.addEventListener('keydown', onWindowKeydown)
  if (running.value) startLoop()
})

watch(running, (on) => {
  if (on) startLoop()
  else stopLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('keydown', onWindowKeydown)
  resizeObs?.disconnect()
  resizeObs = null
  view?.dispose()
  view = null
  lastRig = null
  pickMenu.value = null
  selectedBoneName.value = null
})
</script>
