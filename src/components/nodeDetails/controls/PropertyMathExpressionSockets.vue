<script setup lang="ts">
import { computed, inject } from 'vue'
import { PlusIcon, TrashIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import { generateArrayElementTemplate } from '../../../utils/animFieldSchema'
import {
  formatPresence,
  readNumber,
  readStringField,
  writeNumber,
  writeStringOrCName,
} from '../handleDataFields'
import PropertyNumberSlider from './PropertyNumberSlider.vue'
import PropertyReadonlyRow from './PropertyReadonlyRow.vue'
import PropertyTextField from './PropertyTextField.vue'

const MATH_EXPRESSION_TYPE = 'animMathExpressionNodeData'

const SOCKET_GROUPS = [
  {
    key: 'floatSockets',
    label: 'floatSockets',
    elementType: 'animAnimMathExpressionFloatSocket',
    hasFloatTrack: true,
  },
  {
    key: 'quaternionSockets',
    label: 'quaternionSockets',
    elementType: 'animAnimMathExpressionQuaternionSocket',
    hasFloatTrack: false,
  },
  {
    key: 'vectorSockets',
    label: 'vectorSockets',
    elementType: 'animAnimMathExpressionVectorSocket',
    hasFloatTrack: false,
  },
] as const

type SocketGroupKey = (typeof SOCKET_GROUPS)[number]['key']

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
  removePinArraySlot,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function expressionData(): Record<string, unknown> | null {
  const d = data.value
  if (!d) return null
  return asRecord(d[props.dataKey])
}

function socketsOf(group: SocketGroupKey): Record<string, unknown>[] {
  void handleDataRevision.value
  const container = expressionData()
  const raw = container?.[group]
  if (!Array.isArray(raw)) return []
  return raw.map((el) => asRecord(el) ?? {})
}

function mutateExpressionData(immediate: boolean, fn: (container: Record<string, unknown>) => void) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  let container = asRecord(d[props.dataKey])
  if (!container) {
    container = { $type: MATH_EXPRESSION_TYPE }
    d[props.dataKey] = container
  }
  fn(container)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before, { immediate })
}

function ensureSocketArray(container: Record<string, unknown>, group: SocketGroupKey): unknown[] {
  let arr = container[group]
  if (!Array.isArray(arr)) {
    arr = []
    container[group] = arr
  }
  return arr
}

function varId(group: SocketGroupKey, index: number): number {
  return readNumber(socketsOf(group)[index]?.expressionVarId) ?? 0
}

function setVarId(group: SocketGroupKey, index: number, value: number) {
  mutateExpressionData(false, (container) => {
    const socket = asRecord(ensureSocketArray(container, group)[index])
    if (!socket) return
    writeNumber(socket, 'expressionVarId', value)
  })
}

function trackName(group: SocketGroupKey, index: number): string {
  const track = asRecord(socketsOf(group)[index]?.inputFloatTrack)
  return readStringField(track?.name)
}

function setTrackName(group: SocketGroupKey, index: number, value: string) {
  mutateExpressionData(true, (container) => {
    const socket = asRecord(ensureSocketArray(container, group)[index])
    if (!socket) return
    let track = asRecord(socket.inputFloatTrack)
    if (!track) {
      track = { $type: 'animNamedTrackIndex' }
      socket.inputFloatTrack = track
    }
    writeStringOrCName(track, 'name', value)
  })
}

function linkPresence(group: SocketGroupKey, index: number): string {
  return formatPresence(socketsOf(group)[index]?.link)
}

function addSocket(group: (typeof SOCKET_GROUPS)[number]) {
  mutateExpressionData(true, (container) => {
    const arr = ensureSocketArray(container, group.key)
    const el =
      generateArrayElementTemplate(MATH_EXPRESSION_TYPE, group.key) ??
      { $type: group.elementType }
    el.expressionVarId = arr.length
    arr.push(el)
  })
}

function removeSocket(group: SocketGroupKey, index: number) {
  // Pin names are floatSockets[i] / vectorSockets[i] / … — sync diagram wires.
  removePinArraySlot(group, index)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="mb-1 text-xs text-muted-foreground">{{ label }}</div>
    <div
      v-for="group in SOCKET_GROUPS"
      :key="group.key"
      class="prop-list"
    >
      <div class="prop-list__head">
        <span>{{ group.label }}</span>
        <button
          type="button"
          class="prop-list__icon-btn"
          :title="`Add ${group.label}`"
          :aria-label="`Add ${group.label}`"
          @click="addSocket(group)"
        >
          <PlusIcon :size="12" />
        </button>
      </div>
      <div
        v-if="socketsOf(group.key).length === 0"
        class="prop-list__empty"
      >
        none
      </div>
      <div
        v-for="(_, index) in socketsOf(group.key)"
        :key="`${group.key}-${index}`"
        class="prop-list__slot"
      >
        <div class="prop-list__slot-head">
          <span>[{{ index }}]</span>
          <button
            type="button"
            class="prop-list__icon-btn prop-list__icon-btn--danger"
            :title="`Remove ${group.label}[${index}]`"
            :aria-label="`Remove ${group.label}[${index}]`"
            @click="removeSocket(group.key, index)"
          >
            <TrashIcon :size="12" />
          </button>
        </div>
        <PropertyNumberSlider
          label="expressionVarId"
          :model-value="varId(group.key, index)"
          :slider-min="0"
          :slider-max="15"
          :value-min="0"
          :value-max="65535"
          :step="1"
          :decimals="0"
          @update:model-value="setVarId(group.key, index, $event)"
        />
        <PropertyTextField
          v-if="group.hasFloatTrack"
          label="inputFloatTrack"
          :model-value="trackName(group.key, index)"
          @update:model-value="setTrackName(group.key, index, $event)"
        />
        <PropertyReadonlyRow
          label="link"
          :value="linkPresence(group.key, index)"
        />
      </div>
    </div>
  </div>
</template>

