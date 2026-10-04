<script setup lang="ts">
import { computed, inject, nextTick, ref } from 'vue'
import { CheckIcon, PencilIcon, XIcon } from 'lucide-vue-next'
import {
  nodeDetailsContextKey,
  type NodeDetailsContext,
} from '../../../composables/useNodeDetailsContext'
import {
  fieldTypeName,
  generateDataTemplate,
  getAnimTypeFields,
  listAnimTypeImplementations,
  resolveAnimFields,
} from '../../../utils/animFieldSchema'
import { allocateNextNumericId } from '../../../utils/graph/nodeAddBootstrap'
import { resolveHandleId } from '../../../utils/graph/diagramMaterialize'
import type { AnimgraphNode } from '../../../utils/graph/animgraphTypes'
import { isAnimgraphLinkObject } from '../../../utils/extractors/NodeReferenceUtils'
import PropertyStructElement, {
  type StructValuePatch,
} from './PropertyStructElement.vue'

const NONE = ''

const props = defineProps<{
  dataKey: string
  label: string
  baseType: string
  /** When set, `dataKey` is an array of handle refs and this slot is `dataKey[index]`. */
  index?: number
  /** Diagram pin input: type locked; HandleId rename syncs diagram boxes. */
  pinBound?: boolean
}>()

const {
  selectedHandleData,
  handleDataRevision,
  notifySelectedHandleDataChanged,
  snapshotHandleField,
  recordHandleFieldEdit,
  handlesRegistry,
  allNodes,
  renamePinHandleId,
} = inject<NodeDetailsContext>(nodeDetailsContextKey)!

const data = computed(() => {
  void handleDataRevision.value
  return selectedHandleData.value
})

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function registry(): Map<string, AnimgraphNode> | null {
  return handlesRegistry.value
}

function slotValue(): unknown {
  void handleDataRevision.value
  const raw = data.value?.[props.dataKey]
  if (props.index == null) return raw
  return Array.isArray(raw) ? raw[props.index] : undefined
}

function setSlotValue(value: unknown) {
  const d = data.value
  if (!d) return
  if (props.index == null) {
    d[props.dataKey] = value
    return
  }
  let arr = d[props.dataKey]
  if (!Array.isArray(arr)) {
    arr = []
    d[props.dataKey] = arr
  }
  const list = arr as unknown[]
  while (list.length <= props.index) list.push(null)
  list[props.index] = value
}

/**
 * Point this slot at `refId` without destroying link wrappers
 * (`animPoseLink` / floatLink → keep `$type` + write `node.HandleRefId`).
 */
function writeSlotHandleRef(refId: string) {
  const slot = slotValue()
  if (isAnimgraphLinkObject(slot)) {
    const prev = slot.node
    if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
      const node = prev as Record<string, unknown>
      delete node.HandleId
      delete node.Data
      node.HandleRefId = refId
      return
    }
    slot.node = { HandleRefId: refId }
    return
  }
  setSlotValue({ HandleRefId: refId })
}

function fieldValue(): unknown {
  void handleDataRevision.value
  return slotValue()
}

function handleId(): string | null {
  const reg = registry()
  if (!reg) return null
  return resolveHandleId(fieldValue(), reg)
}

function payload(): Record<string, unknown> | null {
  // Link / pin slots store wrappers — prefer the referenced handle body.
  const id = handleId()
  if (id) {
    const fromReg = asRecord(registry()?.get(id)?.Data)
    if (fromReg) return fromReg
  }

  const raw = asRecord(fieldValue())
  if (raw?.Data && typeof raw.Data === 'object' && !Array.isArray(raw.Data)) {
    return raw.Data as Record<string, unknown>
  }
  // Inline embed body (not a link wrapper, not a handle stub).
  if (
    raw &&
    typeof raw.$type === 'string' &&
    !('HandleId' in raw) &&
    !('HandleRefId' in raw) &&
    !('node' in raw)
  ) {
    return raw
  }
  return null
}

const typeOptions = computed(() => {
  const listed = listAnimTypeImplementations(props.baseType)
  const current = currentType.value
  if (current && current !== NONE && !listed.includes(current)) {
    return [NONE, current, ...listed]
  }
  return [NONE, ...listed]
})

const currentType = computed(() => {
  void handleDataRevision.value
  const t = payload()?.$type
  return typeof t === 'string' ? t : NONE
})

function typeLabel(typeName: string): string {
  if (!typeName) return 'none'
  return typeName
    .replace(/^animAnimNodeSourceChannel_/, '')
    .replace(/^animIAnimNode/, '')
}

const optionLabels = computed(() =>
  Object.fromEntries(typeOptions.value.map((name) => [name, typeLabel(name)]))
)

const payloadFields = computed(() => {
  const typeName = currentType.value
  if (!typeName) return []
  return resolveAnimFields(typeName)
})

function mutate(immediate: boolean, fn: () => void) {
  const d = data.value
  if (!d) return
  const before = snapshotHandleField(props.dataKey)
  fn()
  notifySelectedHandleDataChanged()
  recordHandleFieldEdit(props.dataKey, before, { immediate })
}

function ensureHandle(typeName: string): Record<string, unknown> | null {
  const d = data.value
  const reg = registry()
  if (!d || !reg) return null

  const existing = payload()
  const id = handleId()
  if (existing && id && existing.$type === typeName) return existing

  const next = generateDataTemplate(typeName) ?? { $type: typeName }
  if (id) {
    const handle = reg.get(id)
    if (handle) {
      handle.Data = next
      return next
    }
  }

  const nodes = allNodes.value
  const newId = allocateNextNumericId({
    handlesRegistry: reg,
    allNodes: nodes ?? undefined,
  })
  reg.set(newId, { HandleId: newId, Data: next })
  setSlotValue({ HandleRefId: newId })
  return next
}

function setType(typeName: string) {
  if (props.pinBound) return
  mutate(true, () => {
    if (!typeName) {
      setSlotValue(null)
      return
    }
    if (payload() && !handleId()) {
      const next = generateDataTemplate(typeName) ?? { $type: typeName }
      setSlotValue(next)
      return
    }
    ensureHandle(typeName)
  })
}

function applyPathInPlace(
  root: Record<string, unknown>,
  path: string[],
  value: unknown,
  typeName: string
) {
  let cursor = root
  let currentTypeName = typeName
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    const field = getAnimTypeFields(currentTypeName).find((f) => f.key === key)
    const childType = field ? fieldTypeName(field.type) : key
    let next = asRecord(cursor[key])
    if (!next) {
      next = generateDataTemplate(childType) ?? { $type: childType }
      cursor[key] = next
    }
    cursor = next
    currentTypeName = childType
  }
  cursor[path[path.length - 1]] = value
}

function onChildField(key: string, patch: StructValuePatch) {
  mutate(patch.immediate, () => {
    const typeName = currentType.value
    let root = payload()
    if (!root && typeName) root = ensureHandle(typeName)
    if (!root) return
    const path = [key, ...patch.path]
    if (path.length === 0) return
    applyPathInPlace(root, path, patch.value, typeName)
  })
}

function fieldValueAt(key: string): unknown {
  void handleDataRevision.value
  return payload()?.[key]
}

const currentHandleId = computed(() => {
  void handleDataRevision.value
  return handleId() ?? ''
})

/** Pin slots: show connected handle id in the header instead of `[index]`. */
const headLabel = computed(() => {
  void handleDataRevision.value
  if (props.pinBound) {
    return currentHandleId.value || '—'
  }
  return props.label
})

const editingId = ref(false)
const idDraft = ref('')
const idInputRef = ref<HTMLInputElement | null>(null)

function startEditId() {
  if (!currentType.value) return
  idDraft.value = currentHandleId.value
  editingId.value = true
  void nextTick(() => {
    idInputRef.value?.focus()
    idInputRef.value?.select()
  })
}

function cancelEditId() {
  editingId.value = false
  idDraft.value = currentHandleId.value
}

function commitHandleId() {
  if (!editingId.value) return
  const next = idDraft.value.trim()
  const current = currentHandleId.value
  if (!next || next === '-1' || next === '0') return
  if (next === current) {
    editingId.value = false
    return
  }

  if (props.pinBound) {
    if (!current) {
      alert('Connect a node on the diagram before editing HandleId')
      cancelEditId()
      return
    }
    const renamed = renamePinHandleId(current, next)
    if (!renamed.ok) {
      alert(renamed.reason)
      cancelEditId()
      return
    }
    mutate(true, () => {
      writeSlotHandleRef(next)
    })
    editingId.value = false
    return
  }

  mutate(true, () => {
    const d = data.value
    const reg = registry()
    if (!d || !reg) return

    const taken = reg.get(next)
    if (taken) {
      writeSlotHandleRef(next)
      return
    }

    if (current) {
      const handle = reg.get(current)
      if (handle) {
        reg.delete(current)
        handle.HandleId = next
        reg.set(next, handle)
      }
    } else {
      const typeName = currentType.value
      const body = payload() ?? (typeName ? generateDataTemplate(typeName) : null)
      if (!body || typeof body.$type !== 'string') return
      reg.set(next, { HandleId: next, Data: body })
    }
    writeSlotHandleRef(next)
  })
  editingId.value = false
}

function onIdKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitHandleId()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEditId()
  }
}
</script>

<template>
  <div class="prop-list">
    <div class="embed-ref__head">
      <span class="embed-ref__head-label">{{ headLabel }}</span>
      <select
        v-if="!pinBound"
        class="embed-ref__select"
        :value="currentType"
        :aria-label="`${label} type`"
        @change="setType(($event.target as HTMLSelectElement).value)"
      >
        <option
          v-for="opt in typeOptions"
          :key="opt || 'none'"
          :value="opt"
        >
          {{ optionLabels[opt] ?? (opt || 'none') }}
        </option>
      </select>
      <span
        v-else
        class="embed-ref__type-ro"
        :title="currentType || 'none'"
      >
        {{ optionLabels[currentType] ?? (currentType || 'none') }}
      </span>
    </div>
    <div v-if="currentType" class="embed-ref__body">
      <div class="embed-ref__id">
        <span class="embed-ref__id-label">handleId</span>
        <div class="embed-ref__id-edit">
          <template v-if="editingId">
            <input
              ref="idInputRef"
              v-model="idDraft"
              type="text"
              class="embed-ref__id-input"
              aria-label="handleId"
              @keydown="onIdKeydown"
            >
            <button
              type="button"
              class="embed-ref__id-btn embed-ref__id-btn--ok"
              title="Confirm"
              aria-label="Confirm handleId"
              @click="commitHandleId"
            >
              <CheckIcon :size="12" />
            </button>
            <button
              type="button"
              class="embed-ref__id-btn embed-ref__id-btn--cancel"
              title="Cancel"
              aria-label="Cancel handleId edit"
              @click="cancelEditId"
            >
              <XIcon :size="12" />
            </button>
          </template>
          <template v-else>
            <span class="embed-ref__id-value">{{ currentHandleId || '—' }}</span>
            <button
              type="button"
              class="embed-ref__id-btn"
              title="Edit handleId"
              aria-label="Edit handleId"
              @click="startEditId"
            >
              <PencilIcon :size="12" />
            </button>
          </template>
        </div>
      </div>
      <PropertyStructElement
        v-for="field in payloadFields"
        :key="field.key"
        :label="field.key"
        :type="field.type"
        :value="fieldValueAt(field.key)"
        :revision="handleDataRevision"
        @change="onChildField(field.key, $event)"
      />
    </div>
    <div v-else class="prop-list__empty">none</div>
  </div>
</template>

<style scoped>
.embed-ref__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 26px;
  padding: 0 0 0 8px;
  color: var(--control-label);
  font-size: 11px;
  line-height: 26px;
}

.embed-ref__head-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 26px;
  color: var(--control-label);
}

.embed-ref__select {
  flex: 0 1 auto;
  max-width: 55%;
  min-width: 5.5rem;
  height: 26px;
  margin: 0;
  padding: 0 22px 0 8px;
  border: none;
  border-left: 1px solid var(--control-edge);
  border-radius: 0;
  background-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23b3b3b3' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  color: var(--foreground);
  font: inherit;
  font-size: 11px;
  line-height: 26px;
  text-align: right;
  outline: none;
  appearance: none;
  cursor: pointer;
}

.embed-ref__select:hover {
  background-color: var(--control-hover);
}

.embed-ref__type-ro {
  flex: 0 1 auto;
  max-width: 55%;
  min-width: 5.5rem;
  height: 26px;
  margin: 0;
  padding: 0 8px;
  border-left: 1px solid var(--control-edge);
  color: var(--control-label);
  font: inherit;
  font-size: 11px;
  line-height: 26px;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.embed-ref__select option {
  background: var(--canvas);
  color: var(--foreground);
  text-align: left;
}

.embed-ref__body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--control-edge);
}

.embed-ref__id {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 4px 0 8px;
  border: none;
  border-radius: 4px;
  background: var(--canvas);
}

.embed-ref__id-label {
  flex: 0 0 auto;
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--control-label);
  font-size: 11px;
  line-height: 26px;
}

.embed-ref__id-edit {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
}

.embed-ref__id-value,
.embed-ref__id-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  margin: 0;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--foreground);
  font: inherit;
  font-size: 12px;
  text-align: right;
  line-height: 22px;
}

.embed-ref__id-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--control-label);
  cursor: pointer;
}

.embed-ref__id-btn:hover {
  background: var(--control-hover);
  color: var(--foreground);
}

.embed-ref__id-btn--ok:hover {
  background: color-mix(in srgb, var(--primary) 25%, transparent);
  color: var(--foreground);
}

.embed-ref__id-btn--cancel:hover {
  background: color-mix(in srgb, var(--destructive) 25%, transparent);
  color: var(--destructive);
}
</style>
