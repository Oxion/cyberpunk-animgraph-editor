<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue'
import { Plus, TrashIcon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  SIM_DRIVER_DEFAULT_ID,
  type SimDriver,
  type SimDriverHandle,
} from '../../../utils/sim/simDriver'
import type { SimDriverHandleDef } from '../../../utils/sim/simDriverHandleDef'
import { listSimDriverHandleDefs } from '../../../utils/sim/simDriverHandleRegistry'
import {
  deleteSimDriverHandle,
  ensureDefaultSimDriver,
  getSimDriverHandle,
  simDriversRev,
} from '../../../stores/animgraphSim'
import { resolveSimDriverDefIcon } from './simDriverDefIcons'
import { resolveSimDriverUi } from './simDriverUiRegistry'

type DriverRow = {
  driverDefId: string
  label: string
  icon: Component
  handleDef: SimDriverHandleDef<SimDriver>
  handle: SimDriverHandle<SimDriver>
  panel: Component | null
}

type DriverDefOption = {
  id: string
  label: string
  icon: Component
}

const driverDefOptions = computed((): DriverDefOption[] => {
  void simDriversRev.value
  return listSimDriverHandleDefs().map((h) => ({
    id: h.driverDef.id,
    label: h.driverDef.label,
    icon: resolveSimDriverDefIcon(h.driverDef),
  }))
})

const createDriverDefId = ref('')
const typeFilter = ref('')

watch(
  driverDefOptions,
  (opts) => {
    if (!createDriverDefId.value && opts.length) createDriverDefId.value = opts[0]!.id
    else if (
      createDriverDefId.value &&
      !opts.some((o) => o.id === createDriverDefId.value)
    ) {
      createDriverDefId.value = opts[0]?.id ?? ''
    }
  },
  { immediate: true }
)

const selectedDriverDef = computed(() => {
  const id = createDriverDefId.value || driverDefOptions.value[0]?.id
  return driverDefOptions.value.find((o) => o.id === id) ?? null
})

const rows = computed((): DriverRow[] => {
  void simDriversRev.value
  const q = typeFilter.value.trim().toLowerCase()
  const out: DriverRow[] = []
  for (const handleDef of listSimDriverHandleDefs()) {
    const handle = getSimDriverHandle(handleDef)
    if (!handle) continue
    const { id: driverDefId, label } = handleDef.driverDef
    if (
      q &&
      !driverDefId.toLowerCase().includes(q) &&
      !label.toLowerCase().includes(q)
    ) {
      continue
    }
    out.push({
      driverDefId,
      label,
      icon: resolveSimDriverDefIcon(handleDef.driverDef),
      handleDef,
      handle,
      panel: resolveSimDriverUi(driverDefId),
    })
  }
  out.sort((a, b) => a.driverDefId.localeCompare(b.driverDefId))
  return out
})

function onCreate() {
  const id = createDriverDefId.value || driverDefOptions.value[0]?.id
  if (!id) return
  const handleDef = listSimDriverHandleDefs().find((h) => h.driverDef.id === id)
  if (!handleDef) return
  ensureDefaultSimDriver(handleDef)
}

function onDriverDefUpdate(v: unknown) {
  if (typeof v === 'string') createDriverDefId.value = v
}

function onDelete(row: DriverRow) {
  deleteSimDriverHandle(row.handleDef, SIM_DRIVER_DEFAULT_ID)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-1.5">
    <div class="flex shrink-0 items-center gap-1.5">
      <Select
        :model-value="createDriverDefId || driverDefOptions[0]?.id || undefined"
        :disabled="!driverDefOptions.length"
        @update:model-value="onDriverDefUpdate"
      >
        <SelectTrigger
          size="sm"
          class="h-7! min-w-0 flex-1 rounded-sm px-2 py-0 text-xs"
        >
          <SelectValue placeholder="Type">
            <template v-if="selectedDriverDef">
              <component
                :is="selectedDriverDef.icon"
                class="size-3.5 shrink-0"
                :size="14"
              />
              {{ selectedDriverDef.label }}
            </template>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="opt in driverDefOptions"
            :key="opt.id"
            :value="opt.id"
            class="text-xs"
          >
            <component :is="opt.icon" class="size-3.5 shrink-0" :size="14" />
            {{ opt.label }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 w-7 shrink-0 rounded-sm px-0"
        title="Create default driver"
        aria-label="Create default driver"
        :disabled="!driverDefOptions.length"
        @click="onCreate"
      >
        <Plus class="size-3.5" :size="14" />
      </Button>
    </div>
    <Input
      class="h-7 shrink-0 rounded-sm text-xs"
      placeholder="Filter by type"
      v-model="typeFilter"
    />
    <div
      v-if="rows.length"
      class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto"
    >
      <div
        v-for="row in rows"
        :key="row.driverDefId"
        class="prop-list min-w-0"
      >
        <div class="prop-list__head gap-1.5">
          <component
            :is="row.icon"
            class="size-3.5 shrink-0 text-control-label"
            :size="14"
          />
          <span class="min-w-0 flex-1 truncate text-[11px] leading-[26px] text-foreground">
            {{ row.label }}
            <span class="font-normal text-control-label">· {{ row.handle.id }}</span>
          </span>
          <button
            type="button"
            class="prop-list__icon-btn prop-list__icon-btn--danger shrink-0"
            title="Delete driver"
            aria-label="Delete driver"
            @click="onDelete(row)"
          >
            <TrashIcon :size="12" />
          </button>
        </div>
        <div class="prop-list__slot">
          <component :is="row.panel" v-if="row.panel" :handle="row.handle" />
          <p v-else class="prop-list__empty m-0 px-0 pb-0">
            No UI for {{ row.driverDefId }}
          </p>
        </div>
      </div>
    </div>
    <div
      v-else
      class="prop-list flex min-h-[40px] items-center justify-center px-2 py-3"
    >
      <span class="text-center text-[11px] text-control-label">
        {{ typeFilter.trim() ? 'No matching drivers' : 'No drivers — pick a type and press +' }}
      </span>
    </div>
  </div>
</template>
