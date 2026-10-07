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
      <span class="font-data truncate text-[10px] text-muted-foreground">
        {{ statusText }}
      </span>
    </div>
    <div
      ref="hostRef"
      class="relative min-h-0 flex-1 overflow-hidden rounded-sm border border-border/60 bg-[#1a1b1e]"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createSkeletonView, type SkeletonView } from '../utils/sim/skeletonView'
import type { Pose } from '../utils/sim/pose'
import type { RigEntry } from '../utils/sim/rigResource'

export type SkeletonPoseSource = 'full' | 'active' | 'atNode'

const props = defineProps<{
  diagramId: string
  minimized?: boolean
  getPose: (source: SkeletonPoseSource) => { pose: Pose; rig: RigEntry } | null
}>()

const hostRef = ref<HTMLElement | null>(null)
const poseSource = ref<SkeletonPoseSource>('full')
const statusText = ref('No pose')

let view: SkeletonView | null = null
let raf = 0
let resizeObs: ResizeObserver | null = null
let lastRig: RigEntry | null = null

const running = computed(() => !props.minimized)

const sourceBtnClass = (s: SkeletonPoseSource) =>
  poseSource.value === s
    ? 'bg-secondary text-secondary-foreground'
    : 'text-muted-foreground hover:bg-muted/60'

const sourceLabel = (s: SkeletonPoseSource) => {
  if (s === 'full') return 'full'
  if (s === 'active') return 'active'
  return 'at node'
}

const tick = () => {
  raf = 0
  if (!view || !running.value) return
  const pack = props.getPose(poseSource.value)
  if (!pack) {
    statusText.value = 'No pose / rig'
    view.setRig(null)
    lastRig = null
    view.render()
    raf = requestAnimationFrame(tick)
    return
  }
  if (pack.rig !== lastRig) {
    view.setRig(pack.rig)
    lastRig = pack.rig
  }
  view.updateFromPose(pack.pose)
  statusText.value = `${sourceLabel(poseSource.value)} · ${pack.rig.boneNames.length} bones`
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

onMounted(() => {
  const host = hostRef.value
  if (!host) return
  view = createSkeletonView(host)
  view.setSize(host.clientWidth, host.clientHeight)
  resizeObs = new ResizeObserver(() => {
    if (!view || !hostRef.value) return
    view.setSize(hostRef.value.clientWidth, hostRef.value.clientHeight)
  })
  resizeObs.observe(host)
  if (running.value) startLoop()
})

watch(running, (on) => {
  if (on) startLoop()
  else stopLoop()
})

onBeforeUnmount(() => {
  stopLoop()
  resizeObs?.disconnect()
  resizeObs = null
  view?.dispose()
  view = null
  lastRig = null
})
</script>
