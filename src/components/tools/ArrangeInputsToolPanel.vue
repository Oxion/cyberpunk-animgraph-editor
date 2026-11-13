<template>
  <p v-if="!hasSelection" class="tool-hint">
    Select a node on the graph first
  </p>
  <FieldGroup v-else class="gap-3">
    <FieldDescription class="text-[11px] leading-snug">
      Stacks inputs to the left of the node with a fixed horizontal gap and even vertical gaps between node bounds.
    </FieldDescription>

    <Field class="gap-1.5">
      <PropertyNumberSlider
        label="Horizontal gap"
        :model-value="settings.margin"
        :value-min="0"
        :value-max="400"
        :slider-min="0"
        :slider-max="400"
        :step="1"
        :decimals="0"
        @update:model-value="(v) => (settings.margin = v)"
      />
      <FieldDescription class="text-[11px] leading-snug">
        Space between input right edge and selected node left edge
      </FieldDescription>
    </Field>

    <Field class="gap-1.5">
      <PropertyNumberSlider
        label="Gap between nodes"
        :model-value="settings.spacing"
        :value-min="0"
        :value-max="400"
        :slider-min="0"
        :slider-max="400"
        :step="1"
        :decimals="0"
        @update:model-value="(v) => (settings.spacing = v)"
      />
      <FieldDescription class="text-[11px] leading-snug">
        Vertical space between input node bounds
      </FieldDescription>
    </Field>

    <FieldSet v-if="incoming.length > 0" class="gap-1.5">
      <div class="flex items-center justify-between gap-2">
        <FieldTitle class="text-xs">
          Input nodes
        </FieldTitle>
        <ButtonGroup>
          <Button
            size="xs"
            variant="outline"
            title="Select all"
            @click="executeAppCommand(Commands.arrangeInputs.selectAll)"
          >
            All
          </Button>
          <Button
            size="xs"
            variant="outline"
            title="Deselect all"
            @click="executeAppCommand(Commands.arrangeInputs.deselectAll)"
          >
            None
          </Button>
        </ButtonGroup>
      </div>
      <div class="flex max-h-48 flex-col gap-1 overflow-y-auto">
        <Field
          v-for="conn in incoming"
          :key="conn.key"
          orientation="horizontal"
          class="items-center gap-2"
        >
          <Checkbox
            :id="`arrange-input-${conn.key}`"
            :model-value="conn.selected"
            @update:model-value="(v) => executeAppCommand(Commands.arrangeInputs.toggle, { key: conn.key, checked: v === true })"
          />
          <FieldLabel
            :for="`arrange-input-${conn.key}`"
            class="text-xs font-normal"
          >
            {{ conn.label }}
          </FieldLabel>
        </Field>
      </div>
    </FieldSet>
    <p v-else class="tool-hint">
      Selected node has no incoming connections
    </p>

    <Button
      class="w-full"
      :disabled="selectedCount === 0"
      @click="executeAppCommand(Commands.arrangeInputs.run, { margin: settings.margin, spacing: settings.spacing })"
    >
      Arrange Inputs ({{ selectedCount }})
    </Button>
  </FieldGroup>
</template>

<script setup lang="ts">
import { PropertyNumberSlider } from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field'
import { arrangeInputsToolCache, arrangeInputsToolState } from '@/stores/tools'
import { selectedNodeRef } from '@/stores/graphSession'
import { Commands } from '@/app/commands'
import { executeAppCommand } from '@/app/commands/execute'
import { computed } from 'vue'

const settings = arrangeInputsToolState
const hasSelection = computed(() => Boolean(selectedNodeRef.value))
const incoming = computed(() => arrangeInputsToolCache.incoming)
const selectedCount = computed(() => arrangeInputsToolCache.selectedCount)
</script>
