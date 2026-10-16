<script setup lang="ts">
import { FolderKanban, RotateCcw, Trash2, TriangleAlert, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  applyProjectDiagramEdits,
  closeProjectDialog,
  showProjectDialog,
  type ProjectDiagramEdits,
} from '../stores/graphDocumentIo'
import {
  hasProject,
  listDiagramIds,
  mainDiagramId,
} from '../stores/graphProject'

defineProps<{
  busy?: boolean
}>()

type DraftRow = {
  oldId: string
  newId: string
  removed: boolean
}

const rows = ref<DraftRow[]>([])
const draftMainOldId = ref('')
const error = ref('')
const applying = ref(false)

const visibleRows = computed(() => rows.value.filter((r) => !r.removed))

const canRemoveAny = computed(() => visibleRows.value.length > 1)

function isEdited(row: DraftRow) {
  return row.newId.trim() !== row.oldId
}

function revertRow(oldId: string) {
  const row = rows.value.find((r) => r.oldId === oldId)
  if (!row || row.removed) return
  row.newId = row.oldId
  error.value = ''
}

function resetDraft() {
  const ids = listDiagramIds.value
  rows.value = ids.map((id) => ({ oldId: id, newId: id, removed: false }))
  draftMainOldId.value = mainDiagramId.value
  if (!ids.includes(draftMainOldId.value)) {
    draftMainOldId.value = ids[0] ?? ''
  }
  error.value = ''
}

watch(showProjectDialog, (open) => {
  if (open) resetDraft()
})

function removeRow(oldId: string) {
  if (!canRemoveAny.value) return
  const row = rows.value.find((r) => r.oldId === oldId)
  if (!row || row.removed) return
  if (draftMainOldId.value === oldId) {
    error.value = 'Set another diagram as main before removing this one'
    return
  }
  row.removed = true
  error.value = ''
}

function validate(): ProjectDiagramEdits | null {
  const survivors = rows.value.filter((r) => !r.removed)
  if (survivors.length === 0) {
    error.value = 'Project must keep at least one diagram'
    return null
  }

  const idMap: Record<string, string> = {}
  const seenNew = new Set<string>()
  for (const row of survivors) {
    const next = row.newId.trim()
    if (!next) {
      error.value = 'Diagram id must be non-empty'
      return null
    }
    if (seenNew.has(next)) {
      error.value = `Duplicate diagram id: "${next}"`
      return null
    }
    seenNew.add(next)
    idMap[row.oldId] = next
  }

  const mainRow = survivors.find((r) => r.oldId === draftMainOldId.value)
  if (!mainRow) {
    error.value = 'Main diagram must be one of the remaining diagrams'
    return null
  }

  error.value = ''
  return {
    idMap,
    removedIds: rows.value.filter((r) => r.removed).map((r) => r.oldId),
    mainDiagramId: mainRow.newId.trim(),
  }
}

async function onConfirm() {
  const edits = validate()
  if (!edits) return
  applying.value = true
  try {
    const ok = await applyProjectDiagramEdits(edits)
    if (ok) closeProjectDialog()
  } finally {
    applying.value = false
  }
}

function onOpenChange(open: boolean) {
  if (open) {
    if (hasProject.value) showProjectDialog.value = true
    return
  }
  closeProjectDialog()
}
</script>

<template>
  <Dialog :open="showProjectDialog" @update:open="onOpenChange">
    <DialogContent
      class="flex w-[min(40rem,calc(100vw-2rem))] max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-[40rem] [&>button]:hidden"
    >
      <DialogHeader class="sr-only">
        <DialogTitle>Project</DialogTitle>
        <DialogDescription>
          Rename or remove diagrams and choose the main diagram. Confirm reloads the project.
        </DialogDescription>
      </DialogHeader>

      <div
        class="relative flex min-h-0 w-full max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] flex-col gap-2.5 overflow-hidden rounded-sm border border-border bg-card p-3.5 text-left text-card-foreground shadow-lg"
      >
        <div class="flex shrink-0 items-start gap-2.5 pr-8">
          <FolderKanban class="mt-0.5 shrink-0 text-foreground" :size="28" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <h2 class="m-0 text-[15px] font-semibold leading-tight text-foreground">
              Project
            </h2>
            <p class="mt-0.5 mb-0 text-[11px] leading-snug text-muted-foreground">
              Rename or remove diagrams and choose the main diagram. Confirm reloads the project.
            </p>
          </div>
          <button
            type="button"
            class="absolute top-3.5 right-3.5 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden [&_svg]:size-4"
            title="Close"
            @click="closeProjectDialog"
          >
            <X />
            <span class="sr-only">Close</span>
          </button>
        </div>

        <div class="flex min-h-0 flex-1 flex-col gap-1">
          <div class="flex shrink-0 items-center justify-between gap-2">
            <span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Diagrams
            </span>
            <span class="text-[10px] text-muted-foreground">
              Main · id
            </span>
          </div>

          <ScrollArea class="min-h-0 flex-1">
            <RadioGroup
              v-model="draftMainOldId"
              class="!flex !gap-0 flex-col overflow-hidden rounded-sm border border-border bg-background"
              :disabled="busy || applying"
            >
              <div
                v-for="row in visibleRows"
                :key="row.oldId"
                class="border-b border-border px-2 py-1.5 last:border-b-0"
              >
                <div class="grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-start gap-x-2">
                  <div class="flex h-7 items-center justify-center">
                    <RadioGroupItem
                      :value="row.oldId"
                      :id="`project-main-${row.oldId}`"
                      :aria-label="`Set ${row.oldId} as main`"
                    />
                  </div>

                  <div class="min-w-0">
                    <Label :for="`project-diagram-${row.oldId}`" class="sr-only">
                      Diagram id for {{ row.oldId }}
                    </Label>
                    <InputGroup class="h-7 rounded-sm">
                      <InputGroupInput
                        :id="`project-diagram-${row.oldId}`"
                        v-model="row.newId"
                        class="h-7 text-xs"
                        :disabled="busy || applying"
                        spellcheck="false"
                      />
                      <InputGroupAddon
                        v-if="isEdited(row)"
                        align="inline-end"
                        class="py-0"
                      >
                        <InputGroupButton
                          size="icon-xs"
                          title="Revert id"
                          aria-label="Revert id"
                          :disabled="busy || applying"
                          @click="revertRow(row.oldId)"
                        >
                          <RotateCcw />
                        </InputGroupButton>
                      </InputGroupAddon>
                    </InputGroup>
                    <p
                      v-if="isEdited(row)"
                      class="mt-1 min-w-0 truncate text-[10px] text-muted-foreground"
                    >
                      Prev: {{ row.oldId }}
                    </p>
                  </div>

                  <div class="flex h-7 items-center justify-center">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      class="size-7 rounded-sm text-muted-foreground hover:text-destructive"
                      :disabled="busy || applying || !canRemoveAny || draftMainOldId === row.oldId"
                      :title="
                        draftMainOldId === row.oldId
                          ? 'Set another diagram as main before removing'
                          : 'Remove diagram'
                      "
                      @click="removeRow(row.oldId)"
                    >
                      <Trash2 class="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </RadioGroup>
          </ScrollArea>
        </div>

        <Alert
          v-if="error"
          variant="destructive"
          class="shrink-0 rounded-sm border-[#5c2020] bg-[#1a0808] px-3 py-2 text-xs text-[#f0b0b0] [&>svg]:text-[#f0b0b0] *:data-[slot=alert-description]:text-[#f0b0b0]"
        >
          <TriangleAlert />
          <AlertTitle class="text-xs font-medium leading-none text-[#f5c4c4]">
            Cannot apply
          </AlertTitle>
          <AlertDescription class="text-[11px] leading-snug">
            {{ error }}
          </AlertDescription>
        </Alert>

        <div class="flex shrink-0 justify-end gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            class="rounded-sm"
            :disabled="applying"
            @click="closeProjectDialog"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            class="rounded-sm"
            :disabled="busy || applying || !hasProject"
            @click="onConfirm"
          >
            {{ applying ? 'Applying…' : 'Confirm' }}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
