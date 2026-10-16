<script setup lang="ts">
import { toRef } from 'vue'
import type { SimDriverHandle } from '../../../utils/sim/simDriver'
import type { SimWorkspotHubDriver } from '../../../utils/sim/simWorkspotHubDriver'
import { useSimWorkspotHubDriverUi } from '../../../composables/simDrivers/useSimWorkspotHubDriverUi'
import {
  PropertyBoolToggle,
  PropertyNumberSlider,
  PropertyTextField,
} from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import SimAnimNamePickerBtn from './SimAnimNamePickerBtn.vue'

const props = defineProps<{
  handle: SimDriverHandle<SimWorkspotHubDriver> | null
}>()

const { drafts, counter, isActive, playFromDrafts, clear, stop, syncFromDriver } =
  useSimWorkspotHubDriverUi(toRef(props, 'handle'))
</script>

<template>
  <div class="flex flex-col gap-1.5 text-xs">
    <div class="flex min-w-0 items-stretch gap-1.5">
      <PropertyTextField
        class="min-w-0 flex-1"
        label="Anim"
        :model-value="drafts.animName"
        @update:model-value="(v) => (drafts.animName = v)"
      />
      <SimAnimNamePickerBtn
        :model-value="drafts.animName"
        title="Pick animation"
        @update:model-value="(v) => (drafts.animName = v)"
      />
    </div>
    <PropertyTextField
      label="Slot"
      :model-value="drafts.slotName"
      @update:model-value="(v) => (drafts.slotName = v)"
    />
    <div class="grid grid-cols-2 gap-1.5">
      <PropertyBoolToggle
        label="loop"
        :model-value="drafts.isLooped"
        @update:model-value="(v) => (drafts.isLooped = v)"
      />
      <PropertyBoolToggle
        label="pause"
        :model-value="drafts.isPaused"
        @update:model-value="(v) => (drafts.isPaused = v)"
      />
    </div>
    <PropertyNumberSlider
      label="Scale"
      :model-value="drafts.timeScale"
      :slider-min="0"
      :slider-max="4"
      :step="0.05"
      :decimals="2"
      @update:model-value="(v) => (drafts.timeScale = v)"
    />
    <ButtonGroup class="w-full [&>*]:min-w-0 [&>*]:flex-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        title="Apply form to workspot feature (sets active + anim)"
        @click="playFromDrafts()"
      >
        Play
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        title="Clear anim only — hub stays active"
        @click="clear()"
      >
        Clear
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        title="Clear anim and deactivate hub"
        @click="stop()"
      >
        Stop
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        title="Pull current workspot state into the form"
        @click="syncFromDriver()"
      >
        Sync
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
          isActive
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-muted text-muted-foreground'
        "
      >
        {{ isActive ? 'active' : 'inactive' }}
      </span>
      <span
        class="font-data inline-flex h-[18px] shrink-0 items-center rounded-sm bg-muted/50 px-1.5 text-[10px] tabular-nums text-muted-foreground"
      >
        counter {{ counter }}
      </span>
    </div>
  </div>
</template>
