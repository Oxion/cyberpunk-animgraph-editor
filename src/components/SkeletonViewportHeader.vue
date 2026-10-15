<template>
  <div class="flex shrink-0 flex-wrap items-center gap-2">
    <span class="text-[10px] uppercase tracking-wide text-muted-foreground">Pose</span>
    <Tabs v-model="poseSource" class="w-auto gap-0">
      <TabsList class="h-auto w-auto gap-1 rounded-none bg-transparent p-0">
        <TabsTrigger
          value="full"
          class="h-6 flex-none rounded-sm px-2 text-[11px] shadow-none data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60"
          title="Root runner Sample output (composed GraphSlots)"
        >
          full
        </TabsTrigger>
        <TabsTrigger
          value="atNode"
          class="h-6 flex-none rounded-sm px-2 text-[11px] shadow-none data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60"
          title="Pose captured at selected node on a runner of that diagram"
        >
          at node
        </TabsTrigger>
        <TabsTrigger
          value="selected"
          class="h-6 flex-none rounded-sm px-2 text-[11px] shadow-none data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/60"
          title="Sample output of a chosen runner"
        >
          selected
        </TabsTrigger>
      </TabsList>
    </Tabs>
    <SimRunnerSelect
      v-if="poseSource === 'selected'"
      v-model="selectedRunnerId"
      trigger-class="h-6! w-[min(14rem,100%)]"
      trigger-title="Runner for selected pose"
      placeholder="Runner"
    />
    <SimRunnerSelect
      v-else-if="poseSource === 'atNode'"
      v-model="atNodeRunnerId"
      :diagram-id="nodeDiagramId"
      trigger-class="h-6! w-[min(14rem,100%)]"
      trigger-title="Runner executing the node’s diagram"
      placeholder="Runner for node"
    />
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import SimRunnerSelect from './sim/SimRunnerSelect.vue'

export type SkeletonPoseSource = 'full' | 'selected' | 'atNode'

defineProps<{
  /** Diagram that owns the selected node (active / window diagram). */
  nodeDiagramId?: string | null
}>()

const poseSource = defineModel<SkeletonPoseSource>('poseSource', { required: true })
const selectedRunnerId = defineModel<string>('selectedRunnerId', { required: true })
const atNodeRunnerId = defineModel<string>('atNodeRunnerId', { required: true })
const showLabels = defineModel<boolean>('showLabels', { default: false })
</script>
