<script setup lang="ts">
import { computed, toRef } from 'vue'
import { ChevronDown, TrashIcon } from 'lucide-vue-next'
import type { SimDriverHandle } from '../../../utils/sim/simDriver'
import type { SimLookAtDriver } from '../../../utils/sim/simLookAtDriver'
import { useSimLookAtDriverUi } from '../../../composables/simDrivers/useSimLookAtDriverUi'
import {
  PropertyNumberSlider,
  PropertyReadonlyRow,
  PropertyTextField,
} from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
const PREDEFINED_PARTS = ['Eyes', 'Head'] as const

const props = defineProps<{
  handle: SimDriverHandle<SimLookAtDriver> | null
}>()

const {
  createDrafts,
  entryDrafts,
  expanded,
  active,
  addFromDrafts,
  setTarget,
  remove,
  clear,
} = useSimLookAtDriverUi(toRef(props, 'handle'))

const activeParts = computed(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of active.value) {
    if (!e.part || seen.has(e.part)) continue
    seen.add(e.part)
    out.push(e.part)
  }
  out.sort((a, b) => a.localeCompare(b))
  return out
})

const extraParts = computed(() => {
  const predefined = new Set<string>(PREDEFINED_PARTS)
  return activeParts.value.filter((p) => !predefined.has(p))
})

function pickPart(part: string) {
  createDrafts.part = part
}

function fmtCoord(n: number) {
  return n.toFixed(2)
}
</script>

<template>
  <div class="flex flex-col gap-1.5 text-xs">
    <div class="flex min-w-0 items-stretch gap-1.5">
      <PropertyTextField
        class="min-w-0 flex-1"
        label="Part"
        :model-value="createDrafts.part"
        @update:model-value="(v) => (createDrafts.part = v)"
      />
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            class="h-[26px] w-7 shrink-0 rounded-sm px-0"
            title="Pick part"
            aria-label="Pick part"
          >
            <ChevronDown class="size-3.5" :size="14" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-36">
          <DropdownMenuItem
            v-for="part in PREDEFINED_PARTS"
            :key="part"
            class="text-xs"
            @select="pickPart(part)"
          >
            {{ part }}
          </DropdownMenuItem>
          <template v-if="extraParts.length">
            <DropdownMenuSeparator />
            <DropdownMenuItem
              v-for="part in extraParts"
              :key="part"
              class="text-xs"
              @select="pickPart(part)"
            >
              {{ part }}
            </DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
    <div class="flex flex-col gap-1.5">
      <PropertyNumberSlider
        label="X"
        :model-value="createDrafts.targetX"
        :slider-min="-10"
        :slider-max="10"
        :step="0.1"
        :decimals="2"
        @update:model-value="(v) => (createDrafts.targetX = v)"
      />
      <PropertyNumberSlider
        label="Y"
        :model-value="createDrafts.targetY"
        :slider-min="-10"
        :slider-max="10"
        :step="0.1"
        :decimals="2"
        @update:model-value="(v) => (createDrafts.targetY = v)"
      />
      <PropertyNumberSlider
        label="Z"
        :model-value="createDrafts.targetZ"
        :slider-min="-10"
        :slider-max="10"
        :step="0.1"
        :decimals="2"
        @update:model-value="(v) => (createDrafts.targetZ = v)"
      />
    </div>
    <ButtonGroup class="w-full [&>*]:min-w-0 [&>*]:flex-1">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        @click="addFromDrafts()"
      >
        Add
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="h-7 rounded-sm px-2 text-xs"
        @click="clear()"
      >
        Clear
      </Button>
    </ButtonGroup>

    <div
      class="border-0 border-t border-solid border-control-edge"
      role="separator"
    />

    <div v-if="active.length" class="flex flex-col gap-1.5">
      <Collapsible
        v-for="entry in active"
        :key="entry.id"
        v-model:open="expanded[entry.id]"
        class="prop-list min-w-0"
      >
        <div class="prop-list__head gap-1.5">
          <CollapsibleTrigger
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
          >
            <span
              aria-hidden="true"
              class="inline-block size-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current text-control-label opacity-70 transition-transform duration-200"
              :class="expanded[entry.id] ? 'rotate-90' : ''"
            />
            <span class="min-w-0 flex-1 truncate text-[11px] leading-[26px] text-foreground">
              {{ entry.part }}
              <span class="font-normal text-muted-foreground">#{{ entry.id }}</span>
            </span>
            <span
              v-if="!expanded[entry.id]"
              class="font-data shrink-0 tabular-nums text-[10px] text-muted-foreground"
            >
              ({{ fmtCoord(entry.targetWs.x) }}, {{ fmtCoord(entry.targetWs.y) }},
              {{ fmtCoord(entry.targetWs.z) }})
            </span>
          </CollapsibleTrigger>
          <button
            v-if="expanded[entry.id]"
            type="button"
            class="prop-list__icon-btn prop-list__icon-btn--danger shrink-0"
            title="Remove look-at"
            aria-label="Remove look-at"
            @click="remove(entry.id)"
          >
            <TrashIcon :size="12" />
          </button>
        </div>
        <CollapsibleContent
          class="flex flex-col gap-1.5 border-0 border-t border-solid border-control-edge px-2 py-2"
        >
          <PropertyReadonlyRow label="Part" :value="entry.part" />
          <div v-if="entryDrafts[entry.id]" class="flex flex-col gap-1.5">
            <PropertyNumberSlider
              label="X"
              :model-value="entryDrafts[entry.id]!.targetX"
              :slider-min="-10"
              :slider-max="10"
              :step="0.1"
              :decimals="2"
              @update:model-value="(v) => (entryDrafts[entry.id]!.targetX = v)"
            />
            <PropertyNumberSlider
              label="Y"
              :model-value="entryDrafts[entry.id]!.targetY"
              :slider-min="-10"
              :slider-max="10"
              :step="0.1"
              :decimals="2"
              @update:model-value="(v) => (entryDrafts[entry.id]!.targetY = v)"
            />
            <PropertyNumberSlider
              label="Z"
              :model-value="entryDrafts[entry.id]!.targetZ"
              :slider-min="-10"
              :slider-max="10"
              :step="0.1"
              :decimals="2"
              @update:model-value="(v) => (entryDrafts[entry.id]!.targetZ = v)"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            class="h-7 w-full rounded-sm px-2 text-xs"
            @click="setTarget(entry.id)"
          >
            Set
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </div>
    <div
      v-else
      class="prop-list flex min-h-[40px] items-center justify-center px-2 py-3"
    >
      <span class="text-[11px] text-control-label">No active look-ats</span>
    </div>
  </div>
</template>
