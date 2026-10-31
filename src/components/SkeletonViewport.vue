<template>
  <div class="flex h-full min-h-0 w-full flex-col gap-1">
    <div
      v-if="statusText || selectedBoneName"
      class="flex h-6 shrink-0 items-center gap-1"
    >
      <div
        class="font-data min-w-0 flex-1 truncate text-[10px] leading-none text-muted-foreground"
      >
        {{ statusText }}
      </div>
      <Button
        v-if="selectedBoneName"
        type="button"
        size="icon-xs"
        class="size-6 shrink-0"
        :variant="selectedBoneHidden ? 'ghost' : 'secondary'"
        :title="
          selectedBoneHidden
            ? `Show bone · ${selectedBoneName}`
            : `Hide bone · ${selectedBoneName}`
        "
        :aria-label="selectedBoneHidden ? 'Show selected bone' : 'Hide selected bone'"
        :aria-pressed="!selectedBoneHidden"
        @click="toggleSelectedBoneHidden"
      >
        <Bone
          class="size-3.5"
          :size="14"
          :class="selectedBoneHidden ? 'fill-none opacity-60' : 'fill-current'"
        />
      </Button>
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
import { Bone } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  SkeletonView,
  type SkeletonBoneSelection,
  type SkeletonJointClick,
} from '../utils/sim/skeletonView'
import type { Pose } from '../utils/sim/pose'
import type { RigEntry } from '../utils/sim/rigResource'

type PickMenuState = {
  candidates: SkeletonBoneSelection[]
  x: number
  y: number
}

const props = withDefaults(
  defineProps<{
    minimized?: boolean
    showLabels?: boolean
    /** Optional prefix for status (e.g. pose source label). */
    statusLabel?: string
    getPose: () => { pose: Pose; rig: RigEntry } | null
  }>(),
  {
    showLabels: false,
  }
)

/** Bone / stack slot names omitted from draw + pick. */
const hiddenBones = defineModel<ReadonlySet<string>>('hiddenBones', {
  default: () => new Set<string>(),
})

const hostRef = ref<HTMLElement | null>(null)
const pickMenuRef = ref<HTMLElement | null>(null)
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

const selectedBoneHidden = computed(() =>
  selectedBoneName.value ? hiddenBones.value.has(selectedBoneName.value) : false
)

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

const setBoneHidden = (name: string, hidden: boolean) => {
  const next = new Set(hiddenBones.value)
  if (hidden) next.add(name)
  else next.delete(name)
  hiddenBones.value = next
}

const toggleSelectedBoneHidden = () => {
  const name = selectedBoneName.value
  if (!name) return
  setBoneHidden(name, !hiddenBones.value.has(name))
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
  const pack = props.getPose()
  if (!pack) {
    statusText.value = 'No pose / rig'
    view.setRig(null)
    view.updateFromPose(null)
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
  const prefix = props.statusLabel?.trim() || 'pose'
  const base =
    stackN > 0
      ? `${prefix} · ${pack.rig.boneNames.length}+${stackN} stack`
      : `${prefix} · ${pack.rig.boneNames.length} bones`
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

onMounted(async () => {
  const host = hostRef.value
  if (!host) return
  view = new SkeletonView(host, {
    onJointClick,
    hiddenBones: hiddenBones.value,
  })
  view.setShowLabels(props.showLabels)
  const syncSize = () => {
    if (!view || !hostRef.value) return
    const el = hostRef.value
    view.setSize(el.clientWidth, el.clientHeight)
  }
  // Layout may still be 0×0 on first open (window flex); sync after paint.
  await nextTick()
  syncSize()
  requestAnimationFrame(syncSize)
  resizeObs = new ResizeObserver(() => syncSize())
  resizeObs.observe(host)
  window.addEventListener('keydown', onWindowKeydown)
  if (running.value) startLoop()
})

watch(running, (on) => {
  if (on) startLoop()
  else stopLoop()
})

watch(
  () => props.showLabels,
  (on) => {
    view?.setShowLabels(on)
  }
)

watch(
  () => [...hiddenBones.value].sort().join('\0'),
  () => {
    view?.setHiddenBones(hiddenBones.value)
  }
)

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
