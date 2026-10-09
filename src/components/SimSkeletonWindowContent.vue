<template>
  <div class="flex h-full min-h-0 flex-col gap-1.5 p-2">
    <SkeletonViewportHeader
      v-model:pose-source="poseSource"
      v-model:selected-diagram-id="selectedDiagramId"
      v-model:show-labels="showLabels"
      :diagram-options="diagramOptions"
    />

    <Tabs v-model="mainTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
      <TabsList class="grid h-8 w-full shrink-0 grid-cols-2 rounded-sm bg-muted/60 p-0.5">
        <TabsTrigger value="viewport" class="h-7 rounded-sm px-2 text-[11px]">
          Viewport
        </TabsTrigger>
        <TabsTrigger value="bones" class="h-7 rounded-sm px-2 text-[11px]">
          Bones & tracks
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="viewport"
        force-mount
        class="mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        <SkeletonViewport
          class="min-h-0 flex-1"
          :minimized="Boolean(minimized) || mainTab !== 'viewport'"
          :show-labels="showLabels"
          :status-label="sourceLabel(poseSource)"
          :get-pose="fetchPose"
        />
      </TabsContent>

      <TabsContent
        value="bones"
        class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
      >
        <Input
          v-model="nameFilter"
          class="h-7 shrink-0 rounded-sm text-xs"
          placeholder="Filter bones / tracks"
        />

        <div class="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
          <div
            class="flex min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-canvas"
          >
            <div
              class="flex shrink-0 items-center justify-between gap-1 border-b border-border/60 px-2 py-1"
            >
              <p
                class="m-0 min-w-0 truncate text-[9px] uppercase tracking-wide text-muted-foreground/80"
              >
                Rig bones
                <span v-if="rigBoneNames.length" class="opacity-70">
                  ({{ rigBoneNames.length }})
                </span>
              </p>
              <ButtonGroup class="shrink-0">
                <Button
                  v-for="part in TRS_PARTS"
                  :key="`rig-${part}`"
                  type="button"
                  size="xs"
                  class="h-5 min-w-5 px-1.5 text-[10px] uppercase"
                  :variant="showRigTrs[part] ? 'default' : 'outline'"
                  :aria-pressed="showRigTrs[part]"
                  :title="`Toggle ${part.toUpperCase()}`"
                  @click="toggleTrsPart('rig', part)"
                >
                  {{ part }}
                </Button>
              </ButtonGroup>
            </div>
            <p
              v-if="!rigBoneNames.length"
              class="m-0 px-1.5 py-1 text-[10px] text-muted-foreground/70"
            >
              {{ hasPoseData ? 'No matching bones' : 'No pose' }}
            </p>
            <div
              v-else
              v-bind="rigListContainerProps"
              class="min-h-0 flex-1 px-1.5 py-1"
            >
              <div v-bind="rigListWrapperProps">
                <div
                  v-for="item in virtualRigBones"
                  :key="item.data"
                  class="font-data box-border border-b border-border/30 px-0.5 py-1 text-[10px]"
                  :style="{ height: `${rigBoneRowH}px` }"
                >
                  <div class="truncate text-[11px] text-foreground/90" :title="item.data">
                    {{ item.data }}
                  </div>
                  <div
                    v-if="rigTrsLineCount"
                    class="whitespace-pre text-muted-foreground"
                  >
                    {{ formatTrs(rigBoneTrs[item.data], showRigTrs) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="flex min-h-0 flex-col gap-1.5">
            <div
              class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border bg-canvas"
            >
              <div
                class="flex shrink-0 items-center justify-between gap-1 border-b border-border/60 px-2 py-1"
              >
                <p
                  class="m-0 min-w-0 truncate text-[9px] uppercase tracking-wide text-muted-foreground/80"
                >
                  Procedural bones
                  <span v-if="poseRows?.stack.length" class="opacity-70">
                    ({{ poseRows.stack.length }})
                  </span>
                </p>
                <ButtonGroup class="shrink-0">
                  <Button
                    v-for="part in TRS_PARTS"
                    :key="`stack-${part}`"
                    type="button"
                    size="xs"
                    class="h-5 min-w-5 px-1.5 text-[10px] uppercase"
                    :variant="showStackTrs[part] ? 'default' : 'outline'"
                    :aria-pressed="showStackTrs[part]"
                    :title="`Toggle ${part.toUpperCase()}`"
                    @click="toggleTrsPart('stack', part)"
                  >
                    {{ part }}
                  </Button>
                </ButtonGroup>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
                <p
                  v-if="!poseRows?.stack.length"
                  class="m-0 px-0.5 text-[10px] text-muted-foreground/70"
                >
                  {{ hasPoseData ? 'No matching stack bones' : 'No pose' }}
                </p>
                <div
                  v-for="row in poseRows?.stack ?? []"
                  :key="`stack-${row.name}`"
                  class="font-data border-b border-border/30 px-0.5 py-1 text-[10px] last:border-0"
                >
                  <div class="truncate text-[11px] text-cyan-300/90" :title="row.name">
                    {{ row.name }}
                  </div>
                  <div
                    v-if="stackTrsLineCount"
                    class="whitespace-pre-wrap break-all text-muted-foreground"
                  >
                    {{ formatTrs(row.trs, showStackTrs) }}
                  </div>
                </div>
              </div>
            </div>

            <div
              class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border bg-canvas"
            >
              <p
                class="m-0 shrink-0 border-b border-border/60 px-2 py-1 text-[9px] uppercase tracking-wide text-muted-foreground/80"
              >
                Procedural tracks
                <span v-if="poseRows?.track.length" class="opacity-70">
                  ({{ poseRows.track.length }})
                </span>
              </p>
              <div class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
                <p
                  v-if="!poseRows?.track.length"
                  class="m-0 px-0.5 text-[10px] text-muted-foreground/70"
                >
                  {{ hasPoseData ? 'No matching tracks' : 'No pose' }}
                </p>
                <div
                  v-for="row in poseRows?.track ?? []"
                  :key="`track-${row.name}`"
                  class="font-data flex items-baseline gap-1 border-b border-border/30 px-0.5 py-1 text-[10px] last:border-0"
                >
                  <span class="min-w-0 flex-1 truncate text-amber-300/90" :title="row.name">
                    {{ row.name }}
                  </span>
                  <span class="shrink-0 tabular-nums text-muted-foreground">
                    {{ formatTrack(row.value) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVirtualList } from '@vueuse/core'
import SkeletonViewport from './SkeletonViewport.vue'
import SkeletonViewportHeader, {
  type SkeletonPoseSource,
} from './SkeletonViewportHeader.vue'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  activeDiagramId,
  listDiagramIds,
  mainDiagramId,
} from '../stores/graphProject'
import {
  simGetDerivedPoseStats,
  simSnapshotsByDiagram,
  simStackCaptureHandleIds,
} from '../stores/animgraphSim'
import { emptySimSnapshot } from '../utils/sim/simSnapshot'
import {
  type DerivedPoseRef,
  type DerivedPoseStatsNeed,
} from '../utils/sim/poseDerivedStats'
import type { BoneTrs, Pose } from '../utils/sim/pose'
import type { RigEntry } from '../utils/sim/rigResource'

type BoneRow = { name: string; trs: BoneTrs }
type TrackRow = { name: string; value: number }

const EMPTY_NAMES: string[] = []
const EMPTY_BONES: BoneRow[] = []
const EMPTY_TRACKS: TrackRow[] = []
const TRS_PARTS = ['t', 'r', 's'] as const
type TrsPart = (typeof TRS_PARTS)[number]
/** name line + padding; +14px per visible TRS line */
const RIG_BONE_ROW_BASE_H = 28
const RIG_BONE_TRS_LINE_H = 14

type PoseRowsBundle = {
  /** Derived stats existed (before name filter). */
  hadSource: boolean
  stack: BoneRow[]
  track: TrackRow[]
}

/** Filtered rig bone names; rebuild only when rig identity or filter changes. */
let filteredRigNames: {
  rig: RigEntry
  filter: string
  names: string[]
} | null = null

const getFilteredRigNames = (rig: RigEntry, filter: string): string[] => {
  if (filteredRigNames?.rig === rig && filteredRigNames.filter === filter) {
    return filteredRigNames.names
  }
  const names = !filter
    ? rig.boneNames
    : rig.boneNames.filter((n) => n.toLowerCase().includes(filter))
  filteredRigNames = { rig, filter, names }
  return names
}

export type { SkeletonPoseSource }

const props = defineProps<{
  diagramId: string
  minimized?: boolean
  getPose: (
    source: SkeletonPoseSource,
    selectedDiagramId?: string | null
  ) => { pose: Pose; rig: RigEntry } | null
}>()

const mainTab = ref<'viewport' | 'bones'>('viewport')
const poseSource = ref<SkeletonPoseSource>('full')
const selectedDiagramId = ref(props.diagramId)
const showLabels = ref(false)
const nameFilter = ref('')
type TrsParts = Record<TrsPart, boolean>
const defaultTrsParts = (): TrsParts => ({ t: true, r: true, s: false })
const showRigTrs = ref(defaultTrsParts())
const showStackTrs = ref(defaultTrsParts())

const toggleTrsPart = (list: 'rig' | 'stack', part: TrsPart) => {
  const target = list === 'rig' ? showRigTrs : showStackTrs
  target.value = { ...target.value, [part]: !target.value[part] }
}

const countTrsLines = (parts: TrsParts) =>
  (parts.t ? 1 : 0) + (parts.r ? 1 : 0) + (parts.s ? 1 : 0)

const rigTrsLineCount = computed(() => countTrsLines(showRigTrs.value))
const stackTrsLineCount = computed(() => countTrsLines(showStackTrs.value))

const rigBoneRowH = computed(
  () => RIG_BONE_ROW_BASE_H + rigTrsLineCount.value * RIG_BONE_TRS_LINE_H
)

const diagramOptions = computed(() => listDiagramIds.value)

const sourceLabel = (s: SkeletonPoseSource) => {
  if (s === 'full') return 'full'
  if (s === 'selected') return 'selected'
  return 'at node'
}

const syncSelectedDiagram = () => {
  const ids = diagramOptions.value
  if (ids.length === 0) {
    selectedDiagramId.value = props.diagramId
    return
  }
  if (!ids.includes(selectedDiagramId.value)) {
    selectedDiagramId.value =
      (ids.includes(props.diagramId) ? props.diagramId : null) ?? ids[0]!
  }
}

watch(
  () => props.diagramId,
  (id) => {
    if (diagramOptions.value.includes(id)) selectedDiagramId.value = id
  }
)

watch(diagramOptions, () => syncSelectedDiagram(), { immediate: true })

const fetchPose = () =>
  props.getPose(
    poseSource.value,
    poseSource.value === 'selected' ? selectedDiagramId.value : null
  )

type DerivedPoseQuery = {
  diagramId: string
  pose: DerivedPoseRef
  need: DerivedPoseStatsNeed
}

const BONES_TAB_NEED: DerivedPoseStatsNeed = {
  rigBones: true,
  stackBones: true,
  trackStack: true,
}

const derivedPoseQuery = computed((): DerivedPoseQuery | null => {
  let diagramId: string | null = null
  let pose: DerivedPoseRef = 'sample'
  if (poseSource.value === 'selected') {
    diagramId = selectedDiagramId.value || null
  } else if (poseSource.value === 'atNode') {
    diagramId =
      activeDiagramId.value ?? selectedDiagramId.value ?? props.diagramId
    const capture = simStackCaptureHandleIds.value[0]
    pose = capture ? { capture } : 'sample'
  } else {
    diagramId = mainDiagramId.value || props.diagramId || null
  }
  if (!diagramId) return null
  return { diagramId, pose, need: BONES_TAB_NEED }
})

/** Single derived-stats fetch while Bones tab is open. */
const derivedPoseStats = computed(() => {
  if (mainTab.value !== 'bones') return null
  const query = derivedPoseQuery.value
  if (!query) return null
  const snap = simSnapshotsByDiagram.value[query.diagramId] ?? emptySimSnapshot()
  return simGetDerivedPoseStats(snap, query.diagramId, {
    pose: query.pose,
    need: query.need,
  })
})

/** Names only — stable while rig + filter unchanged. */
const rigBoneNames = computed((): string[] => {
  const derived = derivedPoseStats.value
  if (!derived?.rig) return EMPTY_NAMES
  return getFilteredRigNames(
    derived.rig,
    nameFilter.value.trim().toLowerCase()
  )
})

const {
  list: virtualRigBones,
  containerProps: rigListContainerProps,
  wrapperProps: rigListWrapperProps,
} = useVirtualList(rigBoneNames, {
  itemHeight: () => rigBoneRowH.value,
  overscan: 2,
})

/** Live TRS map for visible rig rows. */
const rigBoneTrs = computed(
  (): Record<string, BoneTrs> => derivedPoseStats.value?.rigBones?.bones ?? {}
)

/** Stack / track rows + empty-state flag. */
const poseRows = computed((): PoseRowsBundle | null => {
  const derived = derivedPoseStats.value
  if (!derived) return null
  const nameFilterKey = nameFilter.value.trim().toLowerCase()
  const matches = (name: string) =>
    !nameFilterKey || name.toLowerCase().includes(nameFilterKey)

  const stack: BoneRow[] = []
  if (derived.stackBones) {
    for (const [name, trs] of Object.entries(derived.stackBones.bones)) {
      if (!matches(name)) continue
      stack.push({ name, trs })
    }
  }
  const track: TrackRow[] = []
  if (derived.trackStack) {
    for (const name of derived.trackStack.names) {
      if (!matches(name)) continue
      track.push({ name, value: derived.trackStack.values[name] ?? 0 })
    }
  }

  return {
    hadSource: Boolean(derived.rig || derived.stackBones || derived.trackStack),
    stack: stack.length ? stack : EMPTY_BONES,
    track: track.length ? track : EMPTY_TRACKS,
  }
})

const hasPoseData = computed(() => poseRows.value?.hadSource === true)

const formatTrs = (trs: BoneTrs | undefined, parts: TrsParts) => {
  const lines: string[] = []
  if (parts.t) {
    lines.push(
      trs
        ? `t(${trs.tx.toFixed(3)}, ${trs.ty.toFixed(3)}, ${trs.tz.toFixed(3)})`
        : 't(—)'
    )
  }
  if (parts.r) {
    lines.push(
      trs
        ? `r(${trs.qx.toFixed(3)}, ${trs.qy.toFixed(3)}, ${trs.qz.toFixed(3)}, ${trs.qw.toFixed(3)})`
        : 'r(—)'
    )
  }
  if (parts.s) {
    lines.push(
      trs
        ? `s(${trs.sx.toFixed(3)}, ${trs.sy.toFixed(3)}, ${trs.sz.toFixed(3)})`
        : 's(—)'
    )
  }
  return lines.join('\n')
}

const formatTrack = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—')
</script>
