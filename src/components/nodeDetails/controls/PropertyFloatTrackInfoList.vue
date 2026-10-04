<script setup lang="ts">
import { computed, inject } from 'vue'
import { PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import { generateArrayElementTemplate } from '../../../utils/animFieldSchema'
import {
  readNumber,
  readStringField,
  writeNumber,
  writeStringOrCName,
} from '../handleDataFields'
import PropertyNumberSlider from './PropertyNumberSlider.vue'
import PropertyTextField from './PropertyTextField.vue'

const TRACK_INFO_TYPE = 'animFloatTrackInfo'

const props = defineProps<{
  dataKey: string
  label: string
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  recordHandleFieldEdit,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function tracks(): Record<string, unknown>[] {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  if (!Array.isArray(raw)) return []
  return raw.map((el) => asRecord(el) ?? {})
}

function mutateTracks(immediate: boolean, fn: (arr: unknown[]) => void) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  let arr = d[props.dataKey]
  if (!Array.isArray(arr)) {
    arr = []
    d[props.dataKey] = arr
  }
  fn(arr)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before, { immediate })
}

function blankTrack(): Record<string, unknown> {
  const ownerType = typeof data.value?.$type === 'string' ? data.value.$type : ''
  return (
    generateArrayElementTemplate(ownerType, props.dataKey) ?? {
      $type: TRACK_INFO_TYPE,
      name: { $type: 'CName', $storage: 'string', $value: 'None' },
      referenceValue: 0,
    }
  )
}

function trackName(index: number): string {
  return readStringField(tracks()[index]?.name)
}

function setTrackName(index: number, value: string) {
  mutateTracks(true, (arr) => {
    const el = asRecord(arr[index])
    if (!el) return
    writeStringOrCName(el, 'name', value)
  })
}

function referenceValue(index: number): number {
  return readNumber(tracks()[index]?.referenceValue) ?? 0
}

function setReferenceValue(index: number, value: number) {
  mutateTracks(false, (arr) => {
    const el = asRecord(arr[index])
    if (!el) return
    writeNumber(el, 'referenceValue', value)
  })
}

function addTrack() {
  mutateTracks(true, (arr) => {
    arr.push(blankTrack())
  })
}

function removeTrack(index: number) {
  mutateTracks(true, (arr) => {
    if (index >= 0 && index < arr.length) arr.splice(index, 1)
  })
}
</script>

<template>
  <div class="prop-list">
    <div class="prop-list__head">
      <span>{{ label }}</span>
      <button
        type="button"
        class="prop-list__icon-btn"
        :title="`Add ${label}`"
        :aria-label="`Add ${label}`"
        @click="addTrack"
      >
        <PlusIcon :size="12" />
      </button>
    </div>
    <div v-if="tracks().length === 0" class="prop-list__empty">none</div>
    <div
      v-for="(_, index) in tracks()"
      :key="index"
      class="prop-list__slot"
    >
      <div class="prop-list__slot-head">
        <span>[{{ index }}]</span>
        <button
          type="button"
          class="prop-list__icon-btn prop-list__icon-btn--danger"
          :title="`Remove ${label}[${index}]`"
          :aria-label="`Remove ${label}[${index}]`"
          @click="removeTrack(index)"
        >
          <TrashIcon :size="12" />
        </button>
      </div>
      <PropertyTextField
        label="name"
        :model-value="trackName(index)"
        @update:model-value="setTrackName(index, $event)"
      />
      <PropertyNumberSlider
        label="referenceValue"
        :model-value="referenceValue(index)"
        :slider-min="0"
        :slider-max="1"
        :step="0.01"
        :decimals="3"
        @update:model-value="setReferenceValue(index, $event)"
      />
    </div>
  </div>
</template>

