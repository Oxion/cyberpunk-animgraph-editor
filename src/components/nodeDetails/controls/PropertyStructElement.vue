<script setup lang="ts">
import { computed, inject } from 'vue'
import {
  fieldTypeName,
  getAnimEnumValues,
  getAnimTypeFields,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
  resolveAnimType,
  structWrefNodeTarget,
  type AnimFieldType,
} from '../../../utils/animFieldSchema'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import {
  isCNameNameStruct,
  readBool01,
  readNumber,
  readResourcePath,
  readStringField,
  writePlainString,
  writeResourcePath,
  writeStringOrCName,
} from '../handleDataFields'
import PropertyBoolToggle from './PropertyBoolToggle.vue'
import PropertyEnumSelect from './PropertyEnumSelect.vue'
import PropertyNumberSlider from './PropertyNumberSlider.vue'
import PropertyQsTransform from './PropertyQsTransform.vue'
import PropertyReadonlyRow from './PropertyReadonlyRow.vue'
import PropertyStructArray from './PropertyStructArray.vue'
import PropertyTextField from './PropertyTextField.vue'
import PropertyVecBlock from './PropertyVecBlock.vue'

defineOptions({ name: 'PropertyStructElement' })

export type StructValuePatch = {
  path: string[]
  value: unknown
  immediate: boolean
}

const props = withDefaults(
  defineProps<{
    label: string
    type: AnimFieldType
    value: unknown
    revision?: number
    /** When true, wrap nested struct fields in a collapsible group headed by `label`. */
    grouped?: boolean
  }>(),
  { grouped: true }
)

const emit = defineEmits<{
  change: [payload: StructValuePatch]
}>()

const { handleDataRevision } = inject<NodeDetailsContext>(nodeDetailsContextKey)!

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function typeName(): string {
  return fieldTypeName(props.type)
}

function resolvedKind(): string {
  if (isArrayFieldType(props.type)) {
    if (isRefFieldType(props.type.array) || isWrefFieldType(props.type.array)) {
      return 'presence'
    }
    return 'array'
  }
  if (isRefFieldType(props.type) || isWrefFieldType(props.type)) {
    return 'presence'
  }
  const name = typeName()
  if (
    name === 'Vector3' ||
    name === 'Vector4' ||
    name === 'Quaternion' ||
    name === 'QsTransform'
  ) {
    return name
  }
  if (isCNameNameStruct(name)) return 'cnameName'
  if (structWrefNodeTarget(name)) return 'presence'
  const kind = resolveAnimType(name)?.kind ?? 'unknown'
  if (kind === 'class') return 'struct'
  return kind
}

function enumOptions(): readonly string[] {
  return getAnimEnumValues(typeName()) ?? []
}

function boolValue(): boolean {
  return readBool01(props.value)
}

function setBool(on: boolean) {
  emit('change', { path: [], value: on ? 1 : 0, immediate: true })
}

function stringValue(): string {
  return readStringField(props.value)
}

function setCName(text: string) {
  const prev = props.value
  const cloned =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : prev
  const holder: Record<string, unknown> = { value: cloned }
  writeStringOrCName(holder, 'value', text)
  emit('change', { path: [], value: holder.value, immediate: true })
}

function resourcePathValue(): string {
  return readResourcePath(props.value)
}

function setResourcePath(text: string) {
  const prev = props.value
  const cloned =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : prev
  const holder: Record<string, unknown> = { value: cloned }
  writeResourcePath(holder, 'value', text)
  emit('change', { path: [], value: holder.value, immediate: true })
}

function cnameNameValue(): string {
  return readStringField(asRecord(props.value)?.name)
}

function setCNameName(text: string) {
  const prev = asRecord(props.value)?.name
  const cloned =
    prev && typeof prev === 'object' && !Array.isArray(prev)
      ? { ...(prev as Record<string, unknown>) }
      : prev
  const holder: Record<string, unknown> = { value: cloned }
  writeStringOrCName(holder, 'value', text)
  emit('change', { path: ['name'], value: holder.value, immediate: true })
}

function numberValue(): number {
  return readNumber(props.value) ?? 0
}

function setNumber(value: number) {
  emit('change', { path: [], value, immediate: false })
}

function isIntKind(): boolean {
  return resolvedKind() === 'int'
}

const kind = computed(() => resolvedKind())

function enumValue(): string {
  const raw = readStringField(props.value)
  const options = enumOptions()
  if (raw && options.includes(raw)) return raw
  return options[0] ?? raw
}

function setEnum(text: string) {
  const holder: Record<string, unknown> = { value: props.value }
  writePlainString(holder, 'value', text)
  emit('change', { path: [], value: holder.value, immediate: true })
}

function structFields() {
  return getAnimTypeFields(typeName()).filter(
    (field) => field.key !== '$type' && field.key !== 'id'
  )
}

function fieldValue(key: string): unknown {
  void props.revision
  void handleDataRevision.value
  return asRecord(props.value)?.[key]
}

function onChildField(key: string, patch: StructValuePatch) {
  emit('change', {
    path: [key, ...patch.path],
    value: patch.value,
    immediate: patch.immediate,
  })
}

function onVec(payload: { axis: string; value: number }) {
  emit('change', {
    path: [payload.axis],
    value: payload.value,
    immediate: false,
  })
}

function onQsChange(patch: StructValuePatch) {
  emit('change', patch)
}

function presenceText(): string {
  if (props.value == null) return '—'
  if (Array.isArray(props.value)) return String(props.value.length)
  return 'set'
}
</script>

<template>
  <div class="struct-element-host">
    <PropertyBoolToggle
      v-if="kind === 'bool01'"
      :label="label"
      :model-value="boolValue()"
      @update:model-value="setBool"
    />
    <PropertyEnumSelect
      v-else-if="kind === 'enum'"
      :label="label"
      :model-value="enumValue()"
      :options="enumOptions()"
      @update:model-value="setEnum"
    />
    <PropertyTextField
      v-else-if="kind === 'cname' || kind === 'string'"
      :label="label"
      :model-value="stringValue()"
      @update:model-value="setCName"
    />
    <PropertyTextField
      v-else-if="kind === 'resourcePath'"
      :label="label"
      :model-value="resourcePathValue()"
      @update:model-value="setResourcePath"
    />
    <PropertyTextField
      v-else-if="kind === 'cnameName'"
      :label="label"
      :model-value="cnameNameValue()"
      @update:model-value="setCNameName"
    />
    <PropertyNumberSlider
      v-else-if="kind === 'float' || kind === 'int'"
      :label="label"
      :model-value="numberValue()"
      :slider-min="isIntKind() ? 0 : -1"
      :slider-max="isIntKind() ? 255 : 1"
      :step="isIntKind() ? 1 : 0.01"
      :decimals="isIntKind() ? 0 : 3"
      @update:model-value="setNumber"
    />
    <PropertyQsTransform
      v-else-if="kind === 'QsTransform'"
      :label="label"
      :model-value="asRecord(value)"
      :revision="handleDataRevision"
      @change="onQsChange"
    />
    <PropertyVecBlock
      v-else-if="kind === 'Vector3'"
      :label="label"
      :axes="['X', 'Y', 'Z']"
      :target="asRecord(value)"
      :revision="handleDataRevision"
      @change="onVec"
    />
    <PropertyVecBlock
      v-else-if="kind === 'Vector4'"
      :label="label"
      :axes="['X', 'Y', 'Z', 'W']"
      :target="asRecord(value)"
      :revision="handleDataRevision"
      @change="onVec"
    />
    <PropertyVecBlock
      v-else-if="kind === 'Quaternion'"
      :label="label"
      :axes="['i', 'j', 'k', 'r']"
      :target="asRecord(value)"
      :revision="handleDataRevision"
      @change="onVec"
    />
    <PropertyStructArray
      v-else-if="kind === 'array'"
      :label="label"
      :element-type="typeName()"
      :value="value"
      :revision="handleDataRevision"
      @change="emit('change', $event)"
    />
    <PropertyReadonlyRow
      v-else-if="kind === 'presence'"
      :label="label"
      :value="presenceText()"
    />
    <template v-else-if="kind === 'struct'">
      <details v-if="grouped" class="prop-list">
        <summary class="cursor-pointer select-none px-2 py-1 text-xs text-muted-foreground">
          {{ label }}
        </summary>
        <div class="flex flex-col gap-1.5 px-2 pb-2">
          <PropertyStructElement
            v-for="field in structFields()"
            :key="field.key"
            :label="field.key"
            :type="field.type"
            :value="fieldValue(field.key)"
            :revision="handleDataRevision"
            @change="onChildField(field.key, $event)"
          />
        </div>
      </details>
      <template v-else>
        <PropertyStructElement
          v-for="field in structFields()"
          :key="field.key"
          :label="field.key"
          :type="field.type"
          :value="fieldValue(field.key)"
          :revision="handleDataRevision"
          @change="onChildField(field.key, $event)"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
.struct-element-host {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
</style>
