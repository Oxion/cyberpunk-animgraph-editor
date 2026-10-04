<script setup lang="ts">
import { DownloadIcon } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import FileBrowser from './FileBrowser.vue'
import { activeDiagramId, listDiagramIds } from '../stores/graphProject'
import {
  exportToPath,
  showExportDialog,
  suggestedExportFileName,
  type ExportKind,
} from '../stores/graphDocumentIo'

defineProps<{
  busy: boolean
  initialPath?: string | null
}>()

const exportKind = ref<ExportKind>('animgraph')
const diagramId = ref('')

const diagramOptions = computed(() => listDiagramIds.value)

const suggestedName = computed(() =>
  suggestedExportFileName(exportKind.value, diagramId.value)
)

watch(showExportDialog, (open) => {
  if (!open) return
  diagramId.value = activeDiagramId.value ?? listDiagramIds.value[0] ?? ''
  exportKind.value = 'animgraph'
})

watch(diagramOptions, (ids) => {
  if (!ids.includes(diagramId.value)) {
    diagramId.value = activeDiagramId.value ?? ids[0] ?? ''
  }
})

const onKindUpdate = (value: unknown) => {
  if (value === 'diagram' || value === 'animgraph') exportKind.value = value
}

const onDiagramUpdate = (value: unknown) => {
  if (typeof value === 'string') diagramId.value = value
}

const onConfirm = async (path: string) => {
  await exportToPath(exportKind.value, diagramId.value, path)
}
</script>

<template>
  <Dialog v-model:open="showExportDialog">
    <DialogContent
      class="flex w-[min(40rem,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden rounded-sm border-border bg-card p-4 sm:max-w-[40rem]"
    >
      <DialogHeader class="flex shrink-0 flex-row items-start gap-2.5 space-y-0 text-left">
        <DownloadIcon class="mt-0.5 size-7 shrink-0 text-foreground" aria-hidden="true" />
        <div class="min-w-0 flex-1 gap-0">
          <DialogTitle class="text-[15px] leading-tight">
            Export
          </DialogTitle>
          <DialogDescription class="text-[11px] leading-snug">
            Export a diagram JSON or a WolvenKit-wrapped animgraph.
          </DialogDescription>
        </div>
      </DialogHeader>

      <FieldGroup class="w-full shrink-0 !grid grid-cols-2 !gap-2">
        <Field class="min-w-0 gap-1">
          <FieldLabel for="export-diagram-id" class="text-xs">
            Diagram
          </FieldLabel>
          <Select :model-value="diagramId" @update:model-value="onDiagramUpdate">
            <SelectTrigger
              id="export-diagram-id"
              size="sm"
              class="h-7! w-full min-w-0 rounded-sm px-2 py-0 text-xs"
            >
              <SelectValue placeholder="Select diagram" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="id in diagramOptions"
                :key="id"
                :value="id"
              >
                {{ id }}
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field class="min-w-0 gap-1">
          <FieldLabel for="export-kind" class="text-xs">
            Export type
          </FieldLabel>
          <Select :model-value="exportKind" @update:model-value="onKindUpdate">
            <SelectTrigger
              id="export-kind"
              size="sm"
              class="h-7! w-full min-w-0 rounded-sm px-2 py-0 text-xs"
            >
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="diagram">
                Diagram (editor)
              </SelectItem>
              <SelectItem value="animgraph">
                Animgraph (WolvenKit)
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <FileBrowser
        :key="`export-${exportKind}-${diagramId}`"
        class="min-h-0 min-w-0 flex-1"
        mode="save-as"
        :busy="busy"
        :initial-path="initialPath"
        :initial-save-name="suggestedName"
        @confirm="onConfirm"
      />
    </DialogContent>
  </Dialog>
</template>
