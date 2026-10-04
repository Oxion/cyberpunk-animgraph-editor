<script setup lang="ts">
import { computed, inject } from 'vue'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import { generateDataTemplate } from '../../../utils/animFieldSchema'
import { writeNumber } from '../handleDataFields'
import PropertyVecBlock from './PropertyVecBlock.vue'

const AXES_BY_TYPE: Record<string, readonly string[]> = {
  Vector3: ['X', 'Y', 'Z'],
  Vector4: ['X', 'Y', 'Z', 'W'],
  Quaternion: ['i', 'j', 'k', 'r'],
}

const props = defineProps<{
  dataKey: string
  label: string
  structType?: string
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  recordHandleFieldEdit,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const typeName = computed(() => props.structType || 'Vector4')
const axes = computed(() => AXES_BY_TYPE[typeName.value] ?? AXES_BY_TYPE.Vector4)

const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function vec(): Record<string, unknown> | null {
  void handleDataRevision.value
  return asRecord(data.value?.[props.dataKey])
}

function blank(): Record<string, unknown> {
  const name = typeName.value
  const tmpl = generateDataTemplate(name)
  if (tmpl) return tmpl
  if (name === 'Vector3') return { $type: 'Vector3', X: 0, Y: 0, Z: 0 }
  if (name === 'Quaternion') return { $type: 'Quaternion', i: 0, j: 0, k: 0, r: 1 }
  return { $type: 'Vector4', X: 0, Y: 0, Z: 0, W: 0 }
}

function setAxis(payload: { axis: string; value: number }) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  let obj = asRecord(d[props.dataKey])
  if (!obj) {
    obj = blank()
    d[props.dataKey] = obj
  }
  writeNumber(obj, payload.axis, payload.value)
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before)
}
</script>

<template>
  <PropertyVecBlock
    :label="label"
    :axes="axes"
    :target="vec()"
    :revision="handleDataRevision"
    @change="setAxis"
  />
</template>
