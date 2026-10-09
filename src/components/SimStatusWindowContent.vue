<template>
  <div class="flex h-full min-h-0 flex-col gap-1.5 p-2 text-[11px] text-muted-foreground">
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Diagram</span>
      <Select :model-value="selectedDiagramId" @update:model-value="onDiagramUpdate">
        <SelectTrigger
          size="sm"
          class="h-6! w-[min(14rem,100%)] min-w-0 rounded-sm px-2 py-0 text-[11px]"
          title="Diagram whose sim status to show"
        >
          <SelectValue placeholder="Diagram" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="id in diagramOptions" :key="id" :value="id">
            {{ id }}
          </SelectItem>
        </SelectContent>
      </Select>
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
      <div
        v-if="statusFoot.length"
        class="mt-1 flex flex-wrap gap-1 border-t border-border/60 pt-1"
      >
        <span
          v-for="chip in statusFoot"
          :key="chip"
          class="font-data rounded-sm bg-muted/50 px-1 py-0.5 text-[10px]"
        >
          {{ chip }}
        </span>
      </div>
      <div
        v-if="simSampleWarningsEnabled && snapshot.poseStats?.warnings?.length"
        class="mt-1 border-t border-border/60 pt-1 font-data text-[10px] text-amber-400/90"
      >
        <p class="m-0 mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/80">
          Sample warnings ({{ snapshot.poseStats.warnings.length }})
        </p>
        <p
          v-for="(w, i) in snapshot.poseStats.warnings"
          :key="`s-${w.code}-${w.handleId}-${i}`"
          class="m-0 truncate"
          :title="w.message"
        >
          {{ w.message }}
        </p>
      </div>
      <p
        v-else-if="simSampleWarningsEnabled && snapshot.poseStats"
        class="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/70"
      >
        No sample warnings this frame
      </p>
      <div
        v-if="simUpdateWarningsEnabled && snapshot.poseStats?.updateWarnings?.length"
        class="mt-1 border-t border-border/60 pt-1 font-data text-[10px] text-amber-400/90"
      >
        <p class="m-0 mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/80">
          Update warnings ({{ snapshot.poseStats.updateWarnings.length }})
        </p>
        <p
          v-for="(w, i) in snapshot.poseStats.updateWarnings"
          :key="`u-${w.code}-${w.handleId}-${i}`"
          class="m-0 truncate"
          :title="w.message"
        >
          {{ w.message }}
        </p>
      </div>
      <p
        v-else-if="simUpdateWarningsEnabled && snapshot.poseStats"
        class="mt-1 border-t border-border/60 pt-1 text-[10px] text-muted-foreground/70"
      >
        No update warnings this frame
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  simClipStats,
  simFeatureDrafts,
  simSampleWarningsEnabled,
  simSetupEntries,
  simSnapshotsByDiagram,
  simUpdateWarningsEnabled,
  simWrapperWeightDrafts,
} from '../stores/animgraphSim'
import {
  activeDiagramId,
  listDiagramIds,
  mainDiagramId,
} from '../stores/graphProject'
import { emptySimSnapshot } from '../utils/sim/simSnapshot'
import { SimInputBoard } from '../utils/sim/SimInputBoard'

const diagramOptions = computed(() => listDiagramIds.value)

const pickDefaultDiagram = () => {
  const ids = diagramOptions.value
  const active = activeDiagramId.value
  if (active && ids.includes(active)) return active
  const main = mainDiagramId.value
  if (main && ids.includes(main)) return main
  return ids[0] ?? ''
}

const selectedDiagramId = ref(pickDefaultDiagram())

watch(diagramOptions, (ids) => {
  if (!ids.length) {
    selectedDiagramId.value = ''
    return
  }
  if (!ids.includes(selectedDiagramId.value)) {
    selectedDiagramId.value = pickDefaultDiagram()
  }
}, { immediate: true })

const onDiagramUpdate = (value: unknown) => {
  if (typeof value === 'string') selectedDiagramId.value = value
}

const snapshot = computed(
  () =>
    simSnapshotsByDiagram.value[selectedDiagramId.value] ?? emptySimSnapshot()
)

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
  const st = snapshot.value.status
  if (st?.rootHandleId) {
    rows.push({
      key: 'root',
      kind: 'root',
      label: st.rootHandleId,
      detail: st.rootHandleId,
    })
  }
  for (const c of st?.clips ?? []) {
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
  const nodes = snapshot.value.nodes
  for (const [id, sm] of Object.entries(snapshot.value.sms)) {
    if (!nodes[id]?.active) continue
    const trans = sm.isInTransition
      ? `→${sm.targetStateIndex ?? '?'} ${(sm.transitionProgress * 100).toFixed(0)}%`
      : undefined
    const bits: string[] = []
    if (sm.eligibleTransitionIds.length) bits.push(`elig ${sm.eligibleTransitionIds.length}`)
    if (sm.instantChainLength > 1) bits.push(`×${sm.instantChainLength}`)
    rows.push({
      key: `sm-${id}`,
      kind: 'sm',
      label: `${id} · state ${sm.activeStateIndex}`,
      meta: [trans, bits.join(' ')].filter(Boolean).join(' · ') || undefined,
      detail: id,
    })
  }
  return rows
})

const statusFoot = computed((): string[] => {
  const chips: string[] = []
  let wraps = 0
  for (const [name, val] of Object.entries(simWrapperWeightDrafts.value)) {
    if ((val ?? 0) < SimInputBoard.WRAPPER_ACTIVE_THRESHOLD) continue
    chips.push(`w:${name}`)
    if (++wraps >= 4) break
  }
  let feats = 0
  for (const [key, val] of Object.entries(simFeatureDrafts.value)) {
    const n = Number(val)
    if (!Number.isFinite(n) || n === 0) continue
    const sep = key.indexOf('\0')
    const label = sep >= 0 ? `${key.slice(0, sep)}.${key.slice(sep + 1)}` : key
    chips.push(`${label}=${n}`)
    if (++feats >= 4) break
  }
  const activeSets = simSetupEntries.value.filter((e) => e.active).length
  if (simClipStats.value.entryCount) {
    chips.push(`sets ${activeSets}/${simClipStats.value.entryCount}`)
  }
  return chips
})
</script>
