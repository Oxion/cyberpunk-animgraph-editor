<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from 'lucide-vue-next'
import type { AnimSetupEntryView } from '../../utils/sim/clipLibrary'
import type { ClipPoseSetView } from '../../utils/sim/clipPoseLibrary'
import {
  PropertyNumberSlider,
  PropertyReadonlyRow,
} from '@/components/nodeDetails'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

const props = defineProps<{
  entry: AnimSetupEntryView
  pose: ClipPoseSetView | undefined
  wrapperDraft: string
  getClipGlbInfo: (
    clipName: string,
    setupEntryId?: string | null
  ) => { name: string; duration: number } | null
  listGlbAnimNames: (setupEntryId: string) => string[]
}>()

const emit = defineEmits<{
  'update:priority': [number]
  'update:wrapperDraft': [string]
  'pick-glb': []
  'clear-glb': []
  'add-wrapper': []
  'remove-wrapper': [name: string]
  remove: []
}>()

const cardOpen = ref(false)
const poseOpen = ref(true)
const animsOpen = ref(false)

const glbAnimNames = computed(() => props.listGlbAnimNames(props.entry.id))

const poseSource = computed(() => {
  if (!props.pose) return '—'
  return props.pose.sourceLabel
})
</script>

<template>
  <Collapsible v-model:open="cardOpen" class="prop-list min-w-0">
    <div class="prop-list__head gap-1.5">
      <CollapsibleTrigger
        class="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none"
      >
        <span
          aria-hidden="true"
          class="inline-block size-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current text-control-label opacity-70 transition-transform duration-200"
          :class="cardOpen ? 'rotate-90' : ''"
        />
        <span
          class="inline-flex h-[18px] shrink-0 items-center rounded-sm px-1.5 text-[9px] font-semibold uppercase tracking-wide"
          :class="
            entry.active
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-muted text-muted-foreground'
          "
        >
          {{ entry.active ? 'active' : 'off' }}
        </span>
        <span
          class="min-w-0 flex-1 truncate text-[11px] leading-[26px] text-foreground"
          :title="entry.sourceLabel"
        >
          {{ entry.sourceLabel }}
        </span>
      </CollapsibleTrigger>
      <span class="prop-list__index shrink-0">{{ entry.clipCount }}</span>
      <span
        v-if="!cardOpen"
        class="font-data inline-flex h-[18px] shrink-0 items-center rounded-sm bg-muted/50 px-1.5 text-[10px] tabular-nums text-muted-foreground"
        :title="`Priority ${entry.priority}`"
      >
        pri {{ entry.priority }}
      </span>
      <button
        v-else
        type="button"
        class="prop-list__icon-btn prop-list__icon-btn--danger shrink-0"
        title="Remove set"
        aria-label="Remove set"
        @click="emit('remove')"
      >
        <TrashIcon :size="12" />
      </button>
    </div>

    <CollapsibleContent class="flex flex-col gap-1.5 border-0 border-t border-solid border-control-edge px-2 py-2">
      <PropertyNumberSlider
        label="priority"
        :model-value="entry.priority"
        :value-min="0"
        :value-max="255"
        :slider-min="0"
        :slider-max="255"
        :step="1"
        :decimals="0"
        @update:model-value="(v) => emit('update:priority', Number(v))"
      />

      <div class="prop-list">
        <div class="prop-list__head">
          <span>tags</span>
        </div>
        <div
          v-if="entry.tags?.length"
          class="flex flex-wrap content-start gap-1 px-2 pb-2"
        >
          <span
            v-for="tg in entry.tags"
            :key="tg"
            class="font-data rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            :title="tg"
          >
            {{ tg }}
          </span>
        </div>
        <div v-else class="prop-list__empty">none</div>
      </div>

      <Collapsible v-if="pose" v-model:open="poseOpen" class="prop-list">
        <div class="prop-list__head gap-1">
          <CollapsibleTrigger
            class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] leading-[26px] text-control-label outline-none"
          >
            <span
              aria-hidden="true"
              class="inline-block size-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current opacity-70 transition-transform duration-200"
              :class="poseOpen ? 'rotate-90' : ''"
            />
            <span class="min-w-0 flex-1 truncate">pose (.anims.glb)</span>
          </CollapsibleTrigger>
          <div v-if="poseOpen" class="prop-list__actions">
            <button
              type="button"
              class="prop-list__icon-btn prop-list__icon-btn--danger"
              title="Clear .glb"
              aria-label="Clear .glb"
              @click="emit('clear-glb')"
            >
              <TrashIcon :size="12" />
            </button>
          </div>
        </div>
        <CollapsibleContent class="flex flex-col gap-1.5 px-2 pb-2">
          <PropertyReadonlyRow label="source" :value="poseSource" />
          <Collapsible v-model:open="animsOpen" class="prop-list">
            <CollapsibleTrigger
              class="prop-list__head w-full cursor-pointer text-left outline-none"
            >
              <span
                aria-hidden="true"
                class="inline-block size-0 shrink-0 border-y-[4px] border-l-[6px] border-y-transparent border-l-current opacity-70 transition-transform duration-200"
                :class="animsOpen ? 'rotate-90' : ''"
              />
              <span class="min-w-0 flex-1 truncate">animations</span>
              <span class="prop-list__index">{{ glbAnimNames.length }}</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div v-if="glbAnimNames.length" class="flex max-h-28 flex-col overflow-y-auto">
                <div
                  v-for="an in glbAnimNames"
                  :key="an"
                  class="prop-list__row"
                >
                  <span class="prop-list__label font-data">{{ an }}</span>
                  <span
                    v-if="getClipGlbInfo(an, entry.id)"
                    class="prop-list__pin tabular-nums"
                  >
                    {{ getClipGlbInfo(an, entry.id)!.duration.toFixed(3) }}s
                  </span>
                </div>
              </div>
              <div v-else class="prop-list__empty">none</div>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>
      <div v-else class="prop-list">
        <div class="prop-list__head gap-1">
          <span class="min-w-0 flex-1 truncate">pose (.anims.glb)</span>
          <button
            type="button"
            class="prop-list__icon-btn"
            title="Load .glb"
            aria-label="Load .glb"
            @click="emit('pick-glb')"
          >
            <UploadIcon :size="12" />
          </button>
        </div>
      </div>

      <div class="prop-list">
        <div class="prop-list__head">
          <span>variableNames</span>
        </div>
        <div class="flex flex-col gap-1.5 px-2 pb-2">
          <div class="flex h-[26px] items-center gap-1">
            <input
              type="text"
              class="h-full min-w-0 flex-1 rounded-sm border border-control-edge bg-background px-2 text-[11px] leading-[26px] text-foreground outline-none placeholder:text-control-label focus-visible:border-ring"
              placeholder="wrapper name"
              :value="wrapperDraft"
              @input="emit('update:wrapperDraft', ($event.target as HTMLInputElement).value)"
              @keydown.enter.prevent="emit('add-wrapper')"
            >
            <button
              type="button"
              class="inline-flex h-full w-[26px] shrink-0 items-center justify-center rounded-sm border border-control-edge bg-background text-control-label hover:bg-accent hover:text-accent-foreground"
              title="Add wrapper"
              aria-label="Add wrapper"
              @click="emit('add-wrapper')"
            >
              <PlusIcon :size="12" />
            </button>
          </div>
          <div
            v-if="entry.variableNames.length"
            class="flex flex-wrap content-start gap-1"
          >
            <div
              v-for="wn in entry.variableNames"
              :key="wn"
              class="inline-flex h-6 max-w-full items-center overflow-hidden rounded-sm bg-muted/50 text-[10px] text-muted-foreground"
            >
              <span class="font-data min-w-0 truncate px-1.5" :title="wn">{{ wn }}</span>
              <button
                type="button"
                class="inline-flex h-full shrink-0 items-center border-0 border-l border-solid border-control-edge/60 px-1.5 text-control-label hover:bg-destructive/20 hover:text-destructive"
                :title="`Remove ${wn}`"
                :aria-label="`Remove ${wn}`"
                @click="emit('remove-wrapper', wn)"
              >
                ×
              </button>
            </div>
          </div>
          <p v-else class="m-0 text-[11px] leading-normal text-control-label">
            no variables · always active
          </p>
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
</template>
