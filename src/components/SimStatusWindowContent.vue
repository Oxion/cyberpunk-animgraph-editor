<template>
  <div class="flex h-full min-h-0 flex-col gap-1.5 p-2 text-[11px] text-muted-foreground">
    <Tabs v-model="mainTab" class="flex min-h-0 flex-1 flex-col gap-1.5">
      <TabsList class="grid h-8 w-full shrink-0 grid-cols-2 rounded-sm bg-muted/60 p-0.5">
        <TabsTrigger value="status" class="h-7 rounded-sm px-2 text-[11px]">
          Status
        </TabsTrigger>
        <TabsTrigger value="boards" class="h-7 rounded-sm px-2 text-[11px]">
          Boards
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="status"
        class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
      >
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Runner</span>
          <SimRunnerSelect
            v-model="selectedRunnerIdRef"
            trigger-class="h-6! w-[min(14rem,100%)]"
            trigger-title="Runner whose sim status to show"
            placeholder="Runner"
          />
        </div>

        <div
          class="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border bg-canvas px-2 py-1.5"
        >
          <div v-if="!statusRows.length" class="font-data text-muted-foreground/70">No active path</div>
          <div v-else class="flex flex-col gap-1">
            <div
              v-for="row in statusRows"
              :key="row.key"
              class="flex min-w-0 items-baseline gap-2"
            >
              <span class="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                {{ row.kind }}
              </span>
              <span class="font-data min-w-0 flex-1 truncate text-foreground" :title="row.detail">
                {{ row.label }}
              </span>
              <span
                v-if="row.meta"
                class="font-data shrink-0 text-[10px]"
                :class="row.tone === 'danger' ? 'text-destructive' : row.tone === 'warn' ? 'text-amber-500' : ''"
              >{{ row.meta }}</span>
            </div>
          </div>
          <template v-if="sim.updateWarningsEnabled.value">
            <div
              v-if="selectedRunnerSnapshotComputed.update.warnings.length"
              class="mt-1 border-t border-border/60 pt-1 font-data text-[10px] text-amber-400/90"
            >
              <p class="m-0 mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                Update warnings ({{ selectedRunnerSnapshotComputed.update.warnings.length }})
              </p>
              <p
                v-for="(w, i) in selectedRunnerSnapshotComputed.update.warnings"
                :key="`u-${w.code}-${w.handleId}-${i}`"
                class="m-0 truncate"
                :title="w.message"
              >
                {{ w.message }}
              </p>
            </div>
            <p
              v-else
              class="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/70"
            >
              No update warnings this frame
            </p>
          </template>
          <template v-if="sim.sampleWarningsEnabled.value">
            <div
              v-if="selectedRunnerSnapshotComputed.sample?.warnings.length"
              class="mt-1 border-t border-border/60 pt-1 font-data text-[10px] text-amber-400/90"
            >
              <p class="m-0 mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/80">
                Sample warnings ({{ selectedRunnerSnapshotComputed.sample.warnings.length }})
              </p>
              <p
                v-for="(w, i) in selectedRunnerSnapshotComputed.sample.warnings"
                :key="`s-${w.code}-${w.handleId}-${i}`"
                class="m-0 truncate"
                :title="w.message"
              >
                {{ w.message }}
              </p>
            </div>
            <p
              v-else
              class="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/70"
            >
              No sample warnings this frame
            </p>
          </template>
        </div>
      </TabsContent>

      <TabsContent
        value="boards"
        class="mt-0 flex min-h-0 flex-1 flex-col gap-1.5 data-[state=inactive]:hidden"
      >
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Select v-model="selectedBoardId">
            <SelectTrigger
              size="sm"
              class="h-6! w-[min(14rem,100%)] rounded-sm px-2 py-0 text-[11px]"
            >
              <SelectValue placeholder="Board" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="opt in boardSelectOptions"
                :key="opt.id"
                :value="opt.id"
                class="text-xs"
              >
                {{ opt.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Input
            v-model="boardFilter"
            class="h-6 min-w-0 flex-1 rounded-sm text-[11px]"
            placeholder="Filter name / value"
          />
        </div>

        <div
          class="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border bg-canvas px-2 py-1.5"
        >
          <div v-if="!filteredBoardRows.length" class="font-data text-muted-foreground/70">
            No values
          </div>
          <div v-else class="flex flex-col gap-1">
            <div
              v-for="row in filteredBoardRows"
              :key="row.key"
              class="flex min-w-0 items-baseline gap-2"
            >
              <span class="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/80">
                {{ row.kind }}
              </span>
              <span
                class="font-data min-w-0 flex-1 truncate text-foreground"
                :title="row.name"
              >
                {{ row.name }}
              </span>
              <span
                class="font-data shrink-0 max-w-[45%] truncate text-[10px] text-foreground/90"
                :title="row.value"
              >
                {{ row.value }}
              </span>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import SimRunnerSelect from './sim/SimRunnerSelect.vue'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { discovered as animgraphSimDiscovered, sim } from '../stores/animgraphSim'
import { emptySimSnapshot } from '../utils/sim/simSnapshot'
import type { IDraftBoard } from '../composables/sim/types'
import { IDENTITY_QUAT_VEC4, ZERO_VEC4, type SimVec4 } from '../utils/sim'
import type { SimInputBoard } from '../utils/sim/SimInputBoard'

const SIMULATION_BOARD_ID = 'simulation'

const mainTab = ref<'status' | 'boards'>('status')
const selectedRunnerIdRef = ref(sim.getRootRunnerId())
const selectedBoardId = ref(SIMULATION_BOARD_ID)
const boardFilter = ref('')

const selectedRunnerSnapshotComputed = computed(() => {
  return sim.snapshotsByRunner.value[selectedRunnerIdRef.value] ?? emptySimSnapshot()
})

type StatusRow = {
  key: string
  kind: string
  label: string
  meta?: string
  detail?: string
  tone?: 'danger' | 'warn'
}

const statusRows = computed((): StatusRow[] => {
  const rows: StatusRow[] = []

  const snapshotUpdate = selectedRunnerSnapshotComputed.value.update

  if (snapshotUpdate.rootHandleId) {
    rows.push({
      key: 'root',
      kind: 'root',
      label: snapshotUpdate.rootHandleId,
      detail: snapshotUpdate.rootHandleId,
    })
  }

  for (const c of snapshotUpdate.clips) {
    const resolve = c.resolve ?? 'ok'
    let meta: string
    let tone: StatusRow['tone']
    if (resolve === 'ok') {
      meta = `${c.time.toFixed(2)}s · ${(c.progress * 100).toFixed(0)}%`
    } else if (resolve === 'gated') {
      meta = 'GATED'
      tone = 'warn'
    } else if (resolve === 'no-lib') {
      meta = 'NO LIB'
      tone = 'warn'
    } else if (resolve === 'no-db') {
      meta = 'NO DB'
      tone = 'warn'
    } else if (resolve === 'empty') {
      meta = 'EMPTY'
      tone = 'danger'
    } else {
      meta = 'MISSING'
      tone = 'danger'
    }
    rows.push({
      key: `clip-${c.handleId}`,
      kind: 'clip',
      label: `${c.animName} · #${c.handleId}`,
      meta,
      tone,
      detail: `${c.animName} @ ${c.handleId} (${resolve})`,
    })
  }

  const simNodeStateByHandleId = snapshotUpdate.simNodeStateByHandleId
  const simSmStateByHandleId = snapshotUpdate.simSmStateByHandleId
  for (const [id, simSmState] of Object.entries(simSmStateByHandleId)) {
    if (!simNodeStateByHandleId[id]?.active) continue

    const trans = simSmState.isInTransition
      ? `→${simSmState.targetStateIndex ?? '?'} ${(simSmState.transitionProgress * 100).toFixed(0)}%`
      : undefined

    const bits: string[] = []
    if (simSmState.eligibleTransitionIds.length) bits.push(`elig ${simSmState.eligibleTransitionIds.length}`)
    if (simSmState.instantChainLength > 1) bits.push(`×${simSmState.instantChainLength}`)

    rows.push({
      key: `sm-${id}`,
      kind: 'sm',
      label: `${id} · state ${simSmState.activeStateIndex}`,
      meta: [trans, bits.join(' ')].filter(Boolean).join(' · ') || undefined,
      detail: id,
    })
  }
  return rows
})

const boardSelectOptions = computed(() => {
  void sim.draftBoardIdsRev.value
  const ids = sim.listDraftBoardIds()
  return [
    { id: SIMULATION_BOARD_ID, label: 'simulation' },
    ...ids.map((id) => ({ id, label: id })),
  ]
})

watch(boardSelectOptions, (opts) => {
  if (!opts.some((o) => o.id === selectedBoardId.value)) {
    selectedBoardId.value = SIMULATION_BOARD_ID
  }
})

type BoardRow = {
  key: string
  kind: string
  name: string
  value: string
}

const fmtVec4 = (v: SimVec4): string =>
  `${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}, ${v.w.toFixed(3)}`

const featLabel = (feature: string, property: string) => `${feature}.${property}`

const BOARD_KIND_ORDER: Record<string, number> = {
  'feat.num': 0,
  'feat.bool': 1,
  'feat.str': 2,
  'feat.vec': 3,
  'feat.quat': 4,
  float: 10,
  int: 11,
  bool: 12,
  vec: 13,
  quat: 14,
  wrapper: 20,
  tag: 30,
  entityTag: 40,
}

const sortBoardRows = (rows: BoardRow[]): BoardRow[] => {
  rows.sort((a, b) => {
    const ai = BOARD_KIND_ORDER[a.kind] ?? 99
    const bi = BOARD_KIND_ORDER[b.kind] ?? 99
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
  return rows
}

const collectSimulationBoardRows = (board: SimInputBoard): BoardRow[] => {
  const d = sim.discovered.value
  const rows: BoardRow[] = []

  for (const f of d.floatFeatures) {
    const name = featLabel(f.feature, f.property)
    rows.push({
      key: `feat.num-${name}`,
      kind: 'feat.num',
      name,
      value: String(board.getFeature(f.feature, f.property) ?? 0),
    })
  }
  for (const f of d.boolFeatures) {
    const name = featLabel(f.feature, f.property)
    rows.push({
      key: `feat.bool-${name}`,
      kind: 'feat.bool',
      name,
      value: String(board.getBoolFeature(f.feature, f.property) ?? false),
    })
  }
  for (const f of d.stringFeatures) {
    const name = featLabel(f.feature, f.property)
    rows.push({
      key: `feat.str-${name}`,
      kind: 'feat.str',
      name,
      value: board.getStringFeature(f.feature, f.property) ?? '',
    })
  }
  for (const f of d.vectorFeatures) {
    const name = featLabel(f.feature, f.property)
    const v = board.getVectorFeature(f.feature, f.property) ?? ZERO_VEC4
    rows.push({ key: `feat.vec-${name}`, kind: 'feat.vec', name, value: fmtVec4(v) })
  }
  for (const f of d.quatFeatures) {
    const name = featLabel(f.feature, f.property)
    const v = board.getQuatFeature(f.feature, f.property) ?? IDENTITY_QUAT_VEC4
    rows.push({ key: `feat.quat-${name}`, kind: 'feat.quat', name, value: fmtVec4(v) })
  }

  for (const name of d.floatVarNames) {
    rows.push({
      key: `float-${name}`,
      kind: 'float',
      name,
      value: String(board.floatVars.get(name) ?? 0),
    })
  }
  for (const name of d.intVarNames) {
    rows.push({
      key: `int-${name}`,
      kind: 'int',
      name,
      value: String(board.intVars.get(name) ?? 0),
    })
  }
  for (const name of d.boolVarNames) {
    rows.push({
      key: `bool-${name}`,
      kind: 'bool',
      name,
      value: String(board.boolVars.get(name) ?? false),
    })
  }
  for (const name of d.vectorVarNames) {
    const v = board.vectorVars.get(name) ?? ZERO_VEC4
    rows.push({ key: `vec-${name}`, kind: 'vec', name, value: fmtVec4(v) })
  }
  for (const name of d.quatVarNames) {
    const v = board.quatVars.get(name) ?? IDENTITY_QUAT_VEC4
    rows.push({ key: `quat-${name}`, kind: 'quat', name, value: fmtVec4(v) })
  }
  for (const name of d.wrapperNames) {
    rows.push({
      key: `wrapper-${name}`,
      kind: 'wrapper',
      name,
      value: String(board.wrapperWeights.get(name) ?? 0),
    })
  }
  for (const name of d.tagNames) {
    rows.push({
      key: `tag-${name}`,
      kind: 'tag',
      name,
      value: String(board.getTagValue(name) ?? 0),
    })
  }
  for (const name of animgraphSimDiscovered.entityTagsInfoComputed.value.entityTagNames) {
    rows.push({
      key: `entityTag-${name}`,
      kind: 'entityTag',
      name,
      value: String(board.hasEntityTag(name)),
    })
  }

  return sortBoardRows(rows)
}

const collectDraftBoardRows = (draft: IDraftBoard): BoardRow[] => {
  const rows: BoardRow[] = []

  for (const [key, meta] of draft.populatedNumericFeatureKeyToFeatureMap) {
    const v = draft.numericFeatureByKeyRef.value[key]
    if (v === undefined) continue
    const name = featLabel(meta.feature, meta.property)
    rows.push({ key: `feat.num-${key}`, kind: 'feat.num', name, value: String(v) })
  }
  for (const [key, meta] of draft.populatedBooleanFeatureKeyToFeatureMap) {
    const v = draft.booleanFeatureByKeyRef.value[key]
    if (v === undefined) continue
    const name = featLabel(meta.feature, meta.property)
    rows.push({ key: `feat.bool-${key}`, kind: 'feat.bool', name, value: String(v) })
  }
  for (const [key, meta] of draft.populatedStringFeatureKeyToFeatureMap) {
    const v = draft.stringFeatureByKeyRef.value[key]
    if (v === undefined) continue
    const name = featLabel(meta.feature, meta.property)
    rows.push({ key: `feat.str-${key}`, kind: 'feat.str', name, value: v })
  }
  for (const [key, meta] of draft.populatedVectorFeatureKeyToFeatureMap) {
    const v = draft.vectorFeatureByKeyRef.value[key]
    if (!v) continue
    const name = featLabel(meta.feature, meta.property)
    rows.push({ key: `feat.vec-${key}`, kind: 'feat.vec', name, value: fmtVec4(v) })
  }
  for (const [key, meta] of draft.populatedQuatFeatureKeyToFeatureMap) {
    const v = draft.quatFeatureByKeyRef.value[key]
    if (!v) continue
    const name = featLabel(meta.feature, meta.property)
    rows.push({ key: `feat.quat-${key}`, kind: 'feat.quat', name, value: fmtVec4(v) })
  }

  for (const name of draft.populatedFloatVarNamesSet) {
    const v = draft.floatVarByKeyRef.value[name]
    if (v === undefined) continue
    rows.push({ key: `float-${name}`, kind: 'float', name, value: String(v) })
  }
  for (const name of draft.populatedIntVarNamesSet) {
    const v = draft.intVarByKeyRef.value[name]
    if (v === undefined) continue
    rows.push({ key: `int-${name}`, kind: 'int', name, value: String(v) })
  }
  for (const name of draft.populatedBoolVarNamesSet) {
    const v = draft.boolVarByKeyRef.value[name]
    if (v === undefined) continue
    rows.push({ key: `bool-${name}`, kind: 'bool', name, value: String(v) })
  }
  for (const name of draft.populatedVectorVarNamesSet) {
    const v = draft.vectorVarByKeyRef.value[name]
    if (!v) continue
    rows.push({ key: `vec-${name}`, kind: 'vec', name, value: fmtVec4(v) })
  }
  for (const name of draft.populatedQuatVarNamesSet) {
    const v = draft.quatVarByKeyRef.value[name]
    if (!v) continue
    rows.push({ key: `quat-${name}`, kind: 'quat', name, value: fmtVec4(v) })
  }
  for (const name of draft.populatedWrapperWeightNamesSet) {
    const v = draft.wrapperWeightByKeyRef.value[name]
    if (v === undefined) continue
    rows.push({ key: `wrapper-${name}`, kind: 'wrapper', name, value: String(v) })
  }
  for (const name of draft.populatedTagValueNamesSet) {
    const v = draft.tagValueByKeyRef.value[name]
    if (v === undefined) continue
    rows.push({ key: `tag-${name}`, kind: 'tag', name, value: String(v) })
  }
  for (const name of draft.populatedEntityTagNamesSet) {
    const v = draft.entityTagByKeyRef.value[name]
    if (v === undefined) continue
    rows.push({ key: `entityTag-${name}`, kind: 'entityTag', name, value: String(v) })
  }

  return sortBoardRows(rows)
}

const boardRows = computed((): BoardRow[] => {
  // Resample simulation board each frame while status snapshots update.
  void selectedRunnerSnapshotComputed.value

  if (selectedBoardId.value === SIMULATION_BOARD_ID) {
    return collectSimulationBoardRows(sim.board.value)
  }

  const draft = sim.getDraftBoard(selectedBoardId.value)
  if (!draft) return []

  // Touch revision refs so edits recompute the list.
  void draft.numericFeaturesRevisionRef.value
  void draft.stringFeaturesRevisionRef.value
  void draft.booleanFeaturesRevisionRef.value
  void draft.vectorFeaturesRevisionRef.value
  void draft.quatFeaturesRevisionRef.value
  void draft.floatVarsRevisionRef.value
  void draft.intVarsRevisionRef.value
  void draft.boolVarsRevisionRef.value
  void draft.vectorVarsRevisionRef.value
  void draft.quatVarsRevisionRef.value
  void draft.wrapperWeightsRevisionRef.value
  void draft.tagValuesRevisionRef.value
  void draft.entityTagsRevisionRef.value

  return collectDraftBoardRows(draft)
})

const filteredBoardRows = computed((): BoardRow[] => {
  const q = boardFilter.value.trim().toLowerCase()
  if (!q) return boardRows.value
  return boardRows.value.filter(
    (row) =>
      row.name.toLowerCase().includes(q) ||
      row.value.toLowerCase().includes(q) ||
      row.kind.toLowerCase().includes(q),
  )
})
</script>
