<script setup lang="ts">
import { toRef } from 'vue'
import type { SimDriverHandle } from '../../../utils/sim/simDriver'
import type { SimMixerSlotDriver } from '../../../utils/sim/simMixerSlotDriver'
import { useSimMixerSlotDriverUi } from '../../../composables/simDrivers/useSimMixerSlotDriverUi'
import {
  PropertyBoolToggle,
  PropertyNumberSlider,
  PropertyTextField,
} from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import SimAnimNamePickerBtn from './SimAnimNamePickerBtn.vue'

const props = defineProps<{
  handle: SimDriverHandle<SimMixerSlotDriver> | null
}>()

const {
  drafts,
  params,
  applyNormalFromDrafts,
  setCacheParams,
  setIdleFromDrafts,
  clearParams,
  clearIdle,
} = useSimMixerSlotDriverUi(toRef(props, 'handle'))
</script>

<template>
  <div class="flex flex-col gap-1.5 text-xs">
    <div class="grid grid-cols-2 gap-1.5">
      <PropertyBoolToggle
        label="cacheParams"
        :model-value="drafts.cacheParams"
        @update:model-value="(v) => setCacheParams(v)"
      />
      <PropertyBoolToggle
        label="inertia"
        :model-value="drafts.enableInertiaBlend"
        @update:model-value="(v) => (drafts.enableInertiaBlend = v)"
      />
    </div>
    <div class="flex min-w-0 items-stretch gap-1.5">
      <PropertyTextField
        class="min-w-0 flex-1"
        label="Anim"
        :model-value="drafts.normalAnim"
        @update:model-value="(v) => (drafts.normalAnim = v)"
      />
      <SimAnimNamePickerBtn
        :model-value="drafts.normalAnim"
        title="Pick animation"
        @update:model-value="(v) => (drafts.normalAnim = v)"
      />
    </div>
    <PropertyNumberSlider
      label="Weight"
      :model-value="drafts.normalWeight"
      :slider-min="0"
      :slider-max="2"
      :step="0.05"
      :decimals="2"
      @update:model-value="(v) => (drafts.normalWeight = v)"
    />
    <ButtonGroup class="w-full [&>*]:min-w-0 [&>*]:flex-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        @click="applyNormalFromDrafts()"
      >
        Apply
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        @click="clearParams()"
      >
        Clear
      </Button>
    </ButtonGroup>
    <div class="flex min-w-0 items-stretch gap-1.5">
      <PropertyTextField
        class="min-w-0 flex-1"
        label="Idle"
        :model-value="drafts.idleFirst"
        @update:model-value="(v) => (drafts.idleFirst = v)"
      />
      <SimAnimNamePickerBtn
        :model-value="drafts.idleFirst"
        title="Pick idle animation"
        @update:model-value="(v) => (drafts.idleFirst = v)"
      />
    </div>
    <ButtonGroup class="w-full [&>*]:min-w-0 [&>*]:flex-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        @click="setIdleFromDrafts()"
      >
        Set idle
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        @click="clearIdle()"
      >
        Clear idle
      </Button>
    </ButtonGroup>
    <div
      class="border-0 border-t border-solid border-control-edge"
      role="separator"
    />
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex h-[18px] shrink-0 items-center rounded-sm px-1.5 text-[9px] font-semibold uppercase tracking-wide"
        :class="
          params.paramsActive
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-muted text-muted-foreground'
        "
      >
        {{ params.paramsActive ? 'active' : 'inactive' }}
      </span>
      <span
        class="font-data inline-flex h-[18px] shrink-0 items-center rounded-sm bg-muted/50 px-1.5 text-[10px] tabular-nums text-muted-foreground"
      >
        normals {{ params.normal.length }}
      </span>
    </div>
  </div>
</template>
