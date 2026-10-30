<template>
  <div class="flex h-full min-h-0 flex-col gap-1.5 p-2 text-[11px] text-muted-foreground">
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
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SimRunnerSelect from './sim/SimRunnerSelect.vue'
import {
  sim,
  draftBoard,
} from '../stores/animgraphSim'
import { emptySimSnapshot } from '../utils/sim/simSnapshot'
import { SimInputBoard } from '../utils/sim/SimInputBoard'

const selectedRunnerIdRef = ref(sim.getRootRunnerId())

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

const statusFoot = computed((): string[] => {
  const chips: string[] = []
  
  let wraps = 0
  for (const [name, val] of Object.entries(draftBoard.wrapperWeightByKeyRef.value)) {
    if ((val ?? 0) < SimInputBoard.WRAPPER_ACTIVE_THRESHOLD) continue
    chips.push(`w:${name}`)
    if (++wraps >= 4) break
  }
  
  let feats = 0
  for (const [key, val] of Object.entries(draftBoard.numericFeatureByKeyRef.value)) {
    const n = Number(val)
    if (!Number.isFinite(n) || n === 0) continue
    const sep = key.indexOf('\0')
    const label = sep >= 0 ? `${key.slice(0, sep)}.${key.slice(sep + 1)}` : key
    chips.push(`${label}=${n}`)
    if (++feats >= 4) break
  }

  const activeSets = sim.setupEntries.value.filter((e) => e.active).length
  if (sim.clipStats.value.entryCount) {
    chips.push(`sets ${activeSets}/${sim.clipStats.value.entryCount}`)
  }
  return chips
})
</script>
