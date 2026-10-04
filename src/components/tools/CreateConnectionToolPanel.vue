<template>
  <FieldGroup class="gap-3">
    <Field class="gap-1.5">
      <FieldLabel for="connection-from-id" class="flex items-center gap-1.5 text-xs">
        From Node ID
        <HotkeyKbd command="addConnection.pickFrom" size="sm" />
      </FieldLabel>
      <InputGroup class="h-8 rounded-sm">
        <InputGroupInput
          id="connection-from-id"
          v-model="settings.fromId"
          type="text"
          placeholder="Source node ID…"
          class="h-8 text-xs"
        />
        <InputGroupAddon align="inline-end" class="py-0">
          <InputGroupButton
            size="icon-xs"
            :disabled="!selectedId"
            :title="pickFromTitle"
            aria-label="Pick from selected node"
            @click="pickFrom"
          >
            <PipetteIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>

    <Field class="gap-1.5">
      <FieldLabel for="connection-to-id" class="flex items-center gap-1.5 text-xs">
        To Node ID
        <HotkeyKbd command="addConnection.pickTo" size="sm" />
      </FieldLabel>
      <InputGroup class="h-8 rounded-sm">
        <InputGroupInput
          id="connection-to-id"
          :key="settings.toSpecified ? 'to-specified' : `to-follow-${selectedId}`"
          v-model="toDisplay"
          type="text"
          :placeholder="toPlaceholder"
          class="h-8 text-xs"
          :class="settings.toSpecified ? undefined : 'text-muted-foreground'"
        />
        <InputGroupAddon align="inline-end" class="py-0">
          <InputGroupButton
            v-if="settings.toSpecified"
            size="icon-xs"
            title="Follow selected node"
            aria-label="Follow selected node"
            @click="clearTo"
          >
            <XIcon />
          </InputGroupButton>
          <InputGroupButton
            size="icon-xs"
            :disabled="!selectedId"
            :title="pickToTitle"
            aria-label="Pick to selected node"
            @click="pickTo"
          >
            <PipetteIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>

    <Field class="gap-1.5">
      <FieldLabel class="text-xs">
        Pin
      </FieldLabel>
      <PinNamePicker v-model="settings.pinName" :options="pinOptions" />
    </Field>

    <Button
      class="w-full rounded-sm"
      :disabled="!canSubmit"
      @click="onCreate"
    >
      Add Connection
    </Button>
  </FieldGroup>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { PipetteIcon, XIcon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import HotkeyKbd from '../HotkeyKbd.vue'
import { commandShortcut } from '../../stores/hotkeyBindings'
import { getActiveRenderData } from '@/stores/graphProject'
import { selectedNodeRef } from '@/stores/graphSession'
import {
  createConnectionToolState,
  pickCreateConnectionFrom,
  pickCreateConnectionTo,
} from '@/stores/tools'
import { listInputPinOptions } from '@/utils/graph/NodePins'
import PinNamePicker from './PinNamePicker.vue'

const emit = defineEmits<{
  create: [payload: { fromId: string; toId: string; pinName: string }]
}>()

const settings = createConnectionToolState

const selectedId = computed(() => selectedNodeRef.value?.id ?? '')

const toDisplay = computed({
  get: () => (settings.toSpecified ? settings.toId : selectedId.value),
  set: (value: string) => {
    if (!value.trim()) {
      settings.toSpecified = false
      settings.toId = ''
      return
    }
    settings.toSpecified = true
    settings.toId = value
  },
})

const toPlaceholder = computed(() =>
  settings.toSpecified ? 'Target node ID…' : 'Follows selected node…'
)

const effectiveToId = computed(() => toDisplay.value.trim())

const pinOptions = computed(() => {
  const diagramData = getActiveRenderData()
  const toId = effectiveToId.value
  if (!diagramData || !toId) return []
  const node = diagramData.allNodes.get(toId)
  if (!node) return []
  return listInputPinOptions(node, diagramData)
})

const canSubmit = computed(() => {
  const from = settings.fromId.trim()
  const to = effectiveToId.value
  return !!from && !!to && from !== to
})

watch(
  pinOptions,
  (opts) => {
    if (!settings.pinName) return
    if (!opts.some((o) => o.pinId === settings.pinName)) {
      settings.pinName = ''
    }
  }
)

const pickFromTitle = computed(() => {
  const shortcut = commandShortcut('addConnection.pickFrom')
  return shortcut ? `Pick from selected node (${shortcut})` : 'Pick from selected node'
})

const pickToTitle = computed(() => {
  const shortcut = commandShortcut('addConnection.pickTo')
  return shortcut ? `Pick to selected node (${shortcut})` : 'Pick to selected node'
})

const pickFrom = () => {
  pickCreateConnectionFrom(selectedId.value)
}

const pickTo = () => {
  pickCreateConnectionTo(selectedId.value)
}

const clearTo = () => {
  settings.toSpecified = false
  settings.toId = ''
}

const onCreate = () => {
  const fromId = settings.fromId.trim()
  const toId = effectiveToId.value
  if (!fromId || !toId || fromId === toId) return
  emit('create', { fromId, toId, pinName: settings.pinName })
}
</script>
