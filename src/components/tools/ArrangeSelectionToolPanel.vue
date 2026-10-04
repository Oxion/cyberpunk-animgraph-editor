<template>
  <p v-if="selectedCount < 2" class="tool-hint">
    Select at least two nodes on the graph (Ctrl/Cmd+click)
  </p>
  <FieldGroup v-else class="gap-3">
    <FieldDescription class="text-[11px] leading-snug">
      Uses connections within the selection. Active node is anchored.
      {{ selectedCount }} node(s) selected.
      <template v-if="anchorId">
        Anchor: {{ anchorId }} (node stays in place).
      </template>
    </FieldDescription>

    <Field class="gap-1.5">
      <FieldLabel for="arrange-selection-algorithm" class="text-xs">
        Algorithm
      </FieldLabel>
      <Select v-model="settings.algorithm">
        <SelectTrigger id="arrange-selection-algorithm" class="w-full">
          <SelectValue placeholder="Algorithm" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="layered">Layered (left → right)</SelectItem>
          <SelectItem value="mrtree">Mr. Tree (left → right)</SelectItem>
          <SelectItem value="force">Force</SelectItem>
          <SelectItem value="tidy-tree">Tidy tree (Reingold–Tilford)</SelectItem>
          <SelectItem value="cola-flow">Cola flow (directed tree)</SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription class="text-[11px] leading-snug">
        {{ algorithmDescription }}
      </FieldDescription>
    </Field>

    <Field v-if="settings.algorithm === 'layered'" class="gap-1.5">
      <FieldLabel for="arrange-selection-layered-mode" class="text-xs">
        Layered mode
      </FieldLabel>
      <Select v-model="settings.layeredMode">
        <SelectTrigger id="arrange-selection-layered-mode" class="w-full">
          <SelectValue placeholder="Layered mode" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="flat">Standard</SelectItem>
          <SelectItem value="compound">Clustered (compound inputs)</SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription
        v-if="settings.layeredMode === 'compound'"
        class="text-[11px] leading-snug"
      >
        Input ancestors of the active node are laid out inside an isolated cluster so large nodes do not stretch global columns.
      </FieldDescription>
    </Field>

    <Field class="gap-1.5">
      <PropertyNumberSlider
        label="Node spacing"
        :model-value="settings.nodeSpacing"
        :value-min="0"
        :value-max="400"
        :slider-min="0"
        :slider-max="400"
        :step="1"
        :decimals="0"
        @update:model-value="(v) => (settings.nodeSpacing = v)"
      />
    </Field>

    <Field v-if="showsLayerSpacing" class="gap-1.5">
      <PropertyNumberSlider
        label="Layer spacing"
        :model-value="settings.layerSpacing"
        :value-min="0"
        :value-max="600"
        :slider-min="0"
        :slider-max="600"
        :step="1"
        :decimals="0"
        @update:model-value="(v) => (settings.layerSpacing = v)"
      />
      <FieldDescription class="text-[11px] leading-snug">
        Horizontal gap between layout layers
      </FieldDescription>
    </Field>

    <Field v-else-if="settings.algorithm === 'force'" class="gap-1.5">
      <PropertyNumberSlider
        label="Force iterations"
        :model-value="settings.forceIterations"
        :value-min="50"
        :value-max="2000"
        :slider-min="50"
        :slider-max="2000"
        :step="50"
        :decimals="0"
        @update:model-value="(v) => (settings.forceIterations = v)"
      />
      <FieldDescription class="text-[11px] leading-snug">
        More iterations = smoother layout, slower
      </FieldDescription>
    </Field>

    <Button
      class="w-full"
      :disabled="busy"
      @click="onArrange"
    >
      {{ busy ? 'Arranging…' : 'Arrange' }}
    </Button>
  </FieldGroup>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ArrangeSelectionAlgorithm, ElkLayeredVariant } from '../../utils/graph/ElkGraphLayout'
import { PropertyNumberSlider } from '@/components/nodeDetails'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { arrangeSelectionToolState } from '@/stores/tools'

defineProps<{
  selectedCount: number
  anchorId: string | null
  busy: boolean
}>()

const emit = defineEmits<{
  arrange: [payload: {
    algorithm: ArrangeSelectionAlgorithm
    layeredVariant: ElkLayeredVariant
    nodeNodeSpacing: number
    layerSpacing: number
    forceIterations: number
  }]
}>()

const settings = arrangeSelectionToolState

const algorithmDescriptions = {
  layered: 'Layered left → right (ELK).',
  mrtree: 'Mr. Tree left → right (ELK).',
  force: 'Force-directed (ELK).',
  'tidy-tree': 'Reingold–Tilford tidy tree (same as opening animgraph).',
  'cola-flow': 'Directed cola flow (same as opening animgraph).',
} satisfies Record<ArrangeSelectionAlgorithm, string>

const algorithmDescription = computed(
  () => algorithmDescriptions[settings.algorithm]
)

const showsLayerSpacing = computed(
  () =>
    settings.algorithm === 'layered' ||
    settings.algorithm === 'tidy-tree' ||
    settings.algorithm === 'cola-flow'
)

const onArrange = () => {
  emit('arrange', {
    algorithm: settings.algorithm,
    layeredVariant: settings.layeredMode,
    nodeNodeSpacing: settings.nodeSpacing,
    layerSpacing: settings.layerSpacing,
    forceIterations: settings.forceIterations,
  })
}
</script>
