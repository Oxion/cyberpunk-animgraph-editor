<script setup lang="ts">
import { computed, inject } from 'vue'
import {
  PropertyBoolToggle,
  PropertyEnumSelect,
  PropertyFloatTrackInfoList,
  PropertyMathExpressionSockets,
  PropertyNumberSlider,
  PropertyReadonlyRow,
  PropertySameLengthList,
  PropertyEmbedRef,
  PropertyEmbedRefList,
  PropertyStruct,
  PropertyStructList,
  PropertyStringList,
  PropertyNumberList,
  PropertyTextField,
  PropertyVector,
} from './controls'
import {
  formatPresence,
  readBool01,
  readNumber,
  readResourcePath,
  readStringField,
  writeBool01,
  writeNumber,
  writePlainString,
  writeResourcePath,
  writeStringOrCName,
  type PropertyFieldDef,
} from './handleDataFields'
import { generateDataTemplate } from '../../utils/animFieldSchema'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../composables/useNodeDetailsContext'

const props = defineProps<{
  fields: PropertyFieldDef[]
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  recordHandleFieldEdit,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

/** Track revision so in-place Data writes re-render controls (same object identity). */
const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

function dataKey(field: PropertyFieldDef): string {
  return field.dataKey ?? field.key
}

function numberValue(field: PropertyFieldDef): number {
  void handleDataRevision.value
  const d = data.value
  if (!d) return field.sliderMin ?? field.min ?? field.valueMin ?? 0
  return readNumber(d[dataKey(field)]) ?? field.sliderMin ?? field.min ?? field.valueMin ?? 0
}

function setNumber(field: PropertyFieldDef, value: number) {
  const d = data.value
  if (!d) return
  const key = dataKey(field)
  const before = snapshotHandleField(key)
  writeNumber(d, key, value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(key, before)
}

function boolValue(field: PropertyFieldDef): boolean {
  void handleDataRevision.value
  const d = data.value
  if (!d) return false
  return readBool01(d[dataKey(field)])
}

function setBool(field: PropertyFieldDef, value: boolean) {
  const d = data.value
  if (!d) return
  const key = dataKey(field)
  const before = snapshotHandleField(key)
  writeBool01(d, key, value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(key, before, { immediate: true })
}

function stringValue(field: PropertyFieldDef): string {
  void handleDataRevision.value
  const d = data.value
  if (!d) return ''
  return readStringField(d[dataKey(field)])
}

function setString(field: PropertyFieldDef, value: string) {
  const d = data.value
  if (!d) return
  const key = dataKey(field)
  const before = snapshotHandleField(key)
  writeStringOrCName(d, key, value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(key, before, { immediate: true })
}

function resourcePathValue(field: PropertyFieldDef): string {
  void handleDataRevision.value
  const d = data.value
  if (!d) return ''
  return readResourcePath(d[dataKey(field)])
}

function setResourcePath(field: PropertyFieldDef, value: string) {
  const d = data.value
  if (!d) return
  const key = dataKey(field)
  const before = snapshotHandleField(key)
  writeResourcePath(d, key, value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(key, before, { immediate: true })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function cnameNameValue(field: PropertyFieldDef): string {
  void handleDataRevision.value
  const d = data.value
  if (!d) return ''
  return readStringField(asRecord(d[dataKey(field)])?.name)
}

function setCNameName(field: PropertyFieldDef, value: string) {
  const d = data.value
  if (!d) return
  const key = dataKey(field)
  const before = snapshotHandleField(key)
  let obj = asRecord(d[key])
  if (!obj) {
    obj =
      (field.structType ? generateDataTemplate(field.structType) : undefined) ??
      {
        $type: field.structType ?? 'animTransformIndex',
        name: { $type: 'CName', $storage: 'string', $value: 'None' },
      }
    d[key] = obj
  }
  writeStringOrCName(obj, 'name', value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(key, before, { immediate: true })
}

function enumValue(field: PropertyFieldDef): string {
  void handleDataRevision.value
  const d = data.value
  if (!d) return field.options?.[0] ?? ''
  const raw = readStringField(d[dataKey(field)])
  if (raw && field.options?.includes(raw)) return raw
  return field.options?.[0] ?? raw
}

function setEnum(field: PropertyFieldDef, value: string) {
  const d = data.value
  if (!d) return
  const key = dataKey(field)
  const before = snapshotHandleField(key)
  writePlainString(d, key, value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(key, before, { immediate: true })
}

function presenceValue(field: PropertyFieldDef): string {
  void handleDataRevision.value
  const d = data.value
  if (!d) return '—'
  return formatPresence(d[dataKey(field)])
}

function readonlyValue(field: PropertyFieldDef): string {
  void handleDataRevision.value
  if (field.text != null) return field.text
  const d = data.value
  if (!d) return '—'
  const raw = d[dataKey(field)]
  if (Array.isArray(raw)) return String(raw.length)
  if (raw == null) return '—'
  return String(raw)
}
</script>

<template>
  <div v-if="!data" class="py-1 text-xs text-muted-foreground">
    No animgraph data
  </div>
  <div v-else class="flex flex-col gap-1.5 pt-0.5" :data-rev="handleDataRevision">
    <div
      v-for="field in props.fields"
      :key="`${field.key}:${field.kind}:${field.structType ?? ''}`"
      class="flex min-w-0 flex-col gap-1.5"
    >
      <PropertyNumberSlider
        v-if="field.kind === 'number'"
        :label="field.label"
        :model-value="numberValue(field)"
        :slider-min="field.sliderMin ?? field.min ?? 0"
        :slider-max="field.sliderMax ?? field.max ?? 1"
        :value-min="field.valueMin"
        :value-max="field.valueMax"
        :step="field.step ?? 0.01"
        :decimals="field.decimals ?? 3"
        @update:model-value="setNumber(field, $event)"
      />
      <PropertyBoolToggle
        v-else-if="field.kind === 'bool'"
        :label="field.label"
        :model-value="boolValue(field)"
        @update:model-value="setBool(field, $event)"
      />
      <PropertyTextField
        v-else-if="field.kind === 'string'"
        :label="field.label"
        :model-value="stringValue(field)"
        @update:model-value="setString(field, $event)"
      />
      <PropertyTextField
        v-else-if="field.kind === 'resourcePath'"
        :label="field.label"
        :model-value="resourcePathValue(field)"
        @update:model-value="setResourcePath(field, $event)"
      />
      <PropertyTextField
        v-else-if="field.kind === 'cnameName'"
        :label="field.label"
        :model-value="cnameNameValue(field)"
        @update:model-value="setCNameName(field, $event)"
      />
      <PropertyVector
        v-else-if="field.kind === 'vector'"
        :data-key="dataKey(field)"
        :label="field.label"
        :struct-type="field.structType ?? 'Vector4'"
      />
      <PropertyEnumSelect
        v-else-if="field.kind === 'enum'"
        :label="field.label"
        :model-value="enumValue(field)"
        :options="field.options ?? []"
        @update:model-value="setEnum(field, $event)"
      />
      <PropertyStringList
        v-else-if="field.kind === 'stringList'"
        :data-key="dataKey(field)"
        :label="field.label"
      />
      <PropertyNumberList
        v-else-if="field.kind === 'numberList'"
        :data-key="dataKey(field)"
        :label="field.label"
      />
      <PropertyReadonlyRow
        v-else-if="field.kind === 'presence'"
        :label="field.label"
        :value="presenceValue(field)"
      />
      <PropertyMathExpressionSockets
        v-else-if="field.kind === 'mathExpressionSockets'"
        :data-key="dataKey(field)"
        :label="field.label"
      />
      <PropertyFloatTrackInfoList
        v-else-if="field.kind === 'floatTrackInfoList'"
        :data-key="dataKey(field)"
        :label="field.label"
      />
      <PropertySameLengthList
        v-else-if="field.kind === 'sameLengthList'"
        :label="field.label"
        :group-id="field.groupId ?? field.label"
        :group-fields="field.groupFields ?? []"
      />
      <PropertyStruct
        v-else-if="field.kind === 'struct'"
        :data-key="dataKey(field)"
        :label="field.label"
        :struct-type="field.structType ?? ''"
      />
      <PropertyStructList
        v-else-if="field.kind === 'structList'"
        :data-key="dataKey(field)"
        :label="field.label"
        :element-type="field.structType ?? ''"
      />
      <PropertyEmbedRef
        v-else-if="field.kind === 'embed'"
        :data-key="dataKey(field)"
        :label="field.label"
        :base-type="field.structType ?? ''"
        :pin-bound="field.pinBound === true"
      />
      <PropertyEmbedRefList
        v-else-if="field.kind === 'embedList'"
        :data-key="dataKey(field)"
        :label="field.label"
        :base-type="field.structType ?? ''"
        :pin-bound="field.pinBound === true"
      />
      <PropertyReadonlyRow
        v-else
        :label="field.label"
        :value="readonlyValue(field)"
      />
    </div>
  </div>
</template>
