<template>
  <div class="flex shrink-0 flex-wrap items-center gap-2">
    <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Pose</span>
    <Tabs v-model="poseSource" class="w-auto gap-0">
      <TabsList class="h-auto w-auto gap-1 rounded-none bg-transparent p-0">
        <TabsTrigger
          value="full"
          class="h-6 flex-none rounded-sm px-2 text-[11px] shadow-none data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60"
          title="Root diagram Sample output (composed GraphSlots)"
        >
          full
        </TabsTrigger>
        <TabsTrigger
          value="atNode"
          class="h-6 flex-none rounded-sm px-2 text-[11px] shadow-none data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60"
          title="Pose captured at selected node (falls back to selected/full)"
        >
          at node
        </TabsTrigger>
        <TabsTrigger
          value="selected"
          class="h-6 flex-none rounded-sm px-2 text-[11px] shadow-none data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60"
          title="Sample output of a chosen diagram"
        >
          selected
        </TabsTrigger>
      </TabsList>
    </Tabs>
    <Select
      v-if="poseSource === 'selected'"
      :model-value="selectedDiagramId"
      @update:model-value="onDiagramUpdate"
    >
      <SelectTrigger
        size="sm"
        class="h-6! w-[min(12rem,100%)] min-w-0 rounded-sm px-2 py-0 text-[11px]"
        title="Diagram for selected pose"
      >
        <SelectValue placeholder="Diagram" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="id in diagramOptions" :key="id" :value="id">
          {{ id }}
        </SelectItem>
      </SelectContent>
    </Select>
    <div class="ml-auto flex shrink-0 items-center">
      <Button
        type="button"
        size="icon-xs"
        :variant="showLabels ? 'secondary' : 'ghost'"
        title="Toggle bone name labels (rig + procedural stack)"
        aria-label="Toggle bone name labels"
        :aria-pressed="showLabels"
        @click="showLabels = !showLabels"
      >
        <Tag class="size-3.5" :size="14" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Tag } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type SkeletonPoseSource = 'full' | 'selected' | 'atNode'

defineProps<{
  diagramOptions: string[]
}>()

const poseSource = defineModel<SkeletonPoseSource>('poseSource', { required: true })
const selectedDiagramId = defineModel<string>('selectedDiagramId', { required: true })
const showLabels = defineModel<boolean>('showLabels', { default: false })

const onDiagramUpdate = (value: unknown) => {
  if (typeof value === 'string') selectedDiagramId.value = value
}
</script>
