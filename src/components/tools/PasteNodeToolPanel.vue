<template>
  <FieldGroup class="gap-3">
    <Field class="gap-1.5">
      <FieldLabel for="paste-target-id" class="text-xs">
        Target node ID
      </FieldLabel>
      <InputGroup class="h-8 rounded-sm">
        <InputGroupInput
          id="paste-target-id"
          :key="settings.targetSpecified ? 'target-specified' : `target-follow-${selectedId}`"
          v-model="targetDisplay"
          type="text"
          :placeholder="targetPlaceholder"
          class="h-8 text-xs"
          :class="settings.targetSpecified ? undefined : 'text-muted-foreground'"
        />
        <InputGroupAddon align="inline-end" class="py-0">
          <InputGroupButton
            v-if="settings.targetSpecified"
            size="icon-xs"
            title="Follow selected node"
            aria-label="Follow selected node"
            @click="clearTarget"
          >
            <XIcon />
          </InputGroupButton>
          <InputGroupButton
            size="icon-xs"
            :disabled="!selectedId"
            title="Pick target from selected node"
            aria-label="Pick target from selected node"
            @click="pickTarget"
          >
            <PipetteIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>

    <FieldDescription class="text-[11px] leading-snug text-muted-foreground">
      {{ clipboardHint }}
    </FieldDescription>

    <Button
      class="w-full rounded-sm"
      :disabled="!canSubmit"
      @click="onPaste"
    >
      Paste Nodes
    </Button>
  </FieldGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { PipetteIcon, XIcon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { selectedNodeRef } from '@/stores/graphSession'
import { pasteNodeToolCache, pasteNodeToolState } from '@/stores/tools'
import { clearPasteTarget, pickPasteTarget } from '@/stores/tools/pasteNode'

const emit = defineEmits<{
  paste: []
}>()

const settings = pasteNodeToolState

const selectedId = computed(() => selectedNodeRef.value?.id ?? '')

const targetDisplay = computed({
  get: () => (settings.targetSpecified ? settings.targetNodeId : selectedId.value),
  set: (value: string) => {
    if (!value.trim()) {
      settings.targetSpecified = false
      settings.targetNodeId = ''
      return
    }
    settings.targetSpecified = true
    settings.targetNodeId = value
  },
})

const targetPlaceholder = computed(() =>
  settings.targetSpecified ? 'Target node ID…' : 'Follows selected node…'
)

const clipboardHint = computed(() => {
  const n = pasteNodeToolCache.clipboardCount
  if (n <= 0) return 'Clipboard is empty. Copy nodes with the graph focused (Ctrl+C).'
  return n === 1 ? '1 node in clipboard' : `${n} nodes in clipboard`
})

const canSubmit = computed(
  () => pasteNodeToolCache.clipboardCount > 0 && !!targetDisplay.value.trim()
)

const pickTarget = () => {
  pickPasteTarget(selectedId.value)
}

const clearTarget = () => {
  clearPasteTarget()
}

const onPaste = () => {
  if (!canSubmit.value) return
  emit('paste')
}
</script>
