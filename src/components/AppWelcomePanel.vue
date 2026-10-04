<script setup lang="ts">
import { FolderOpenIcon, Workflow, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Field,
  FieldError,
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
import { hasDiagramId, hasProject } from '../stores/graphProject'
import { getPathForFile } from '../api/fsApi'
import {
  beginLoadFromFile,
  beginLoadFromPath,
  cancelPendingDiagramLoad,
  confirmPendingDiagramLoad,
  pendingDiagramLoad,
  type LoadIntent,
} from '../stores/graphDocumentIo'
import { recentFiles } from '../stores/fsFavorites'
import { MAIN_DIAGRAM_ID } from '../utils/graph/diagramTypes'
import type { DirectChildrenLayoutMode } from '../utils/graph/DirectChildrenLayout'

const props = withDefaults(
  defineProps<{
    mode?: LoadIntent
    /** `dialog` = full-app modal shell; `body` = empty-state between header/taskbar */
    host?: 'body' | 'dialog'
    layoutMode: DirectChildrenLayoutMode
    busy: boolean
  }>(),
  {
    mode: 'open',
    host: 'body',
  }
)

const emit = defineEmits<{
  'update:layoutMode': [value: DirectChildrenLayoutMode]
  close: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const diagramIdInput = ref(MAIN_DIAGRAM_ID)
const sourceDiagramId = ref('')
const recentExpanded = ref(false)
const recentSearch = ref('')

const RECENT_PREVIEW = 5

const isAddMode = computed(() => props.mode === 'add')
const isDialogHost = computed(() => props.host === 'dialog' || isAddMode.value)
const loadIntent = computed<LoadIntent>(() => (isAddMode.value ? 'add' : 'open'))
const hasPending = computed(() => pendingDiagramLoad.value != null)
const pendingKind = computed(() => pendingDiagramLoad.value?.kind ?? null)
const needsLayout = computed(() => pendingKind.value === 'animgraph')
const needsSourceDiagram = computed(
  () => isAddMode.value && pendingKind.value === 'project'
)
const projectDiagramIds = computed(
  () => pendingDiagramLoad.value?.projectDiagramIds ?? []
)

const settingsTitle = computed(() => {
  const kind = pendingKind.value
  if (kind === 'project') return 'Import diagram from project'
  if (kind === 'render') return 'Render load settings'
  return 'Animgraph load settings'
})

const panelTitle = computed(() =>
  isAddMode.value ? 'Add Animgraph' : 'Open Animgraph'
)
const panelSubtitle = computed(() =>
  isAddMode.value
    ? 'Import animgraph, render export, or one diagram from a project'
    : 'Open a project, or create one from animgraph / render JSON'
)

const showRecentShowAll = computed(() => true) // TODO: restore `recentFiles.value.length > RECENT_PREVIEW`

const filteredRecent = computed(() => {
  const q = recentSearch.value.trim().toLowerCase()
  if (!q || !recentExpanded.value) return recentFiles.value
  return recentFiles.value.filter(
    (item) =>
      item.name.toLowerCase().includes(q) || item.path.toLowerCase().includes(q)
  )
})

const visibleRecent = computed(() =>
  recentExpanded.value ? filteredRecent.value : recentFiles.value.slice(0, RECENT_PREVIEW)
)

const showBrowserAndDrop = computed(() => !recentExpanded.value)

const diagramIdError = computed(() => {
  if (!hasPending.value) return null
  const id = diagramIdInput.value.trim()
  if (!id) return 'Diagram id must be non-empty'
  // Open replaces the whole project — existing ids are fine.
  if (loadIntent.value === 'add' && hasDiagramId(id)) {
    return `Diagram id already exists: "${id}"`
  }
  return null
})

const sourceDiagramError = computed(() => {
  if (!needsSourceDiagram.value) return null
  if (!sourceDiagramId.value.trim()) return 'Select a diagram from the project'
  return null
})

const canConfirmLoad = computed(
  () => !diagramIdError.value && !sourceDiagramError.value && hasPending.value
)

watch(
  pendingDiagramLoad,
  (pending) => {
    if (!pending) return
    if (pending.kind === 'project') {
      const ids = pending.projectDiagramIds ?? []
      const initial =
        pending.sourceDiagramId && ids.includes(pending.sourceDiagramId)
          ? pending.sourceDiagramId
          : (ids[0] ?? '')
      sourceDiagramId.value = initial
      diagramIdInput.value = initial
      return
    }
    diagramIdInput.value = pending.intent === 'open' ? MAIN_DIAGRAM_ID : ''
  }
)

watch(sourceDiagramId, (id) => {
  if (!needsSourceDiagram.value || !id) return
  diagramIdInput.value = id
})

watch(recentExpanded, (expanded) => {
  if (!expanded) recentSearch.value = ''
})

watch(
  () => recentFiles.value.length,
  (len) => {
    if (len <= RECENT_PREVIEW && recentExpanded.value) {
      recentExpanded.value = false
    }
  }
)

const toggleRecentExpanded = () => {
  recentExpanded.value = !recentExpanded.value
}

const triggerFileUpload = () => {
  fileInput.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  ;(event.target as HTMLInputElement).value = ''
  if (!file) return
  await beginLoadFromFile(file, { intent: loadIntent.value })
}

const handleFileDrop = async (event: DragEvent) => {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  const absPath = getPathForFile(file)
  if (absPath) {
    if (!absPath.toLowerCase().endsWith('.json')) return
    await beginLoadFromPath(absPath, { intent: loadIntent.value })
    return
  }
  if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) return
  await beginLoadFromFile(file, { intent: loadIntent.value })
}

const onBrowserOpen = async (path: string) => {
  await beginLoadFromPath(path, { intent: loadIntent.value })
}

const onRecentOpen = async (path: string) => {
  await beginLoadFromPath(path, { intent: loadIntent.value })
}

const onLayoutModeUpdate = (value: unknown) => {
  if (value === 'tidy-tree' || value === 'elk-compound' || value === 'cola-flow') {
    emit('update:layoutMode', value)
  }
}

const onSourceDiagramUpdate = (value: unknown) => {
  if (typeof value === 'string') sourceDiagramId.value = value
}

const onConfirmLoad = async () => {
  if (!canConfirmLoad.value) {
    if (diagramIdError.value) alert(diagramIdError.value)
    else if (sourceDiagramError.value) alert(sourceDiagramError.value)
    return
  }
  await confirmPendingDiagramLoad(diagramIdInput.value, {
    sourceDiagramId: needsSourceDiagram.value ? sourceDiagramId.value : undefined,
  })
}

const onCancelPending = () => {
  cancelPendingDiagramLoad()
}
</script>

<template>
  <div
    class="relative flex min-h-0 flex-col gap-2.5 overflow-hidden rounded-sm border border-border bg-card p-3.5 text-left text-card-foreground shadow-lg"
    :class="
      isDialogHost
        ? 'w-full max-h-[min(720px,calc(100vh-var(--app-header-h)-var(--app-taskbar-h)-2rem))] max-w-none'
        : 'w-[min(560px,calc(100%-32px))] max-h-[min(560px,calc(100%-32px))]'
    "
  >
    <div class="flex shrink-0 items-start gap-2.5 pr-8">
      <Workflow class="mt-0.5 shrink-0 text-foreground" :size="28" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <h2 class="m-0 text-[15px] font-semibold leading-tight text-foreground">
          {{ panelTitle }}
        </h2>
        <p class="mt-0.5 mb-0 text-[11px] leading-snug text-muted-foreground">
          {{ panelSubtitle }}
        </p>
      </div>
      <button
        v-if="hasProject || isAddMode"
        type="button"
        class="absolute top-3.5 right-3.5 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden [&_svg]:size-4"
        title="Close"
        @click="emit('close')"
      >
        <X />
        <span class="sr-only">Close</span>
      </button>
    </div>

    <div
      v-if="recentFiles.length"
      class="flex shrink-0 flex-col gap-1"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          Recent
        </span>
        <Button
          v-if="showRecentShowAll"
          type="button"
          variant="ghost"
          size="xs"
          class="h-auto rounded-sm px-1 py-0 text-[11px] text-muted-foreground hover:text-foreground"
          @click="toggleRecentExpanded"
        >
          {{ recentExpanded ? 'Close' : 'Show all' }}
        </Button>
      </div>
      <Input
        v-if="recentExpanded"
        v-model="recentSearch"
        type="search"
        placeholder="Filter recent…"
        class="h-7 shrink-0 rounded-sm text-xs"
        :disabled="busy"
      />
      <div
        class="flex h-auto shrink-0 flex-col overflow-x-hidden overflow-y-auto rounded-sm border border-border bg-background"
        :class="recentExpanded ? 'max-h-[calc(20*29px)]' : 'max-h-[calc(5*29px)]'"
      >
        <button
          v-for="item in visibleRecent"
          :key="item.path"
          type="button"
          class="flex h-[29px] min-w-0 cursor-pointer items-center border-b border-border bg-transparent px-2 text-left text-foreground last:border-b-0 hover:bg-muted disabled:cursor-default disabled:opacity-50"
          :title="item.path"
          :disabled="busy"
          @click="onRecentOpen(item.path)"
        >
          <span class="truncate text-[11px] font-medium">{{ item.name }}</span>
        </button>
        <div
          v-if="recentExpanded && visibleRecent.length === 0"
          class="px-2 py-3 text-center text-[11px] text-muted-foreground"
        >
          No matches
        </div>
      </div>
    </div>

    <div v-if="showBrowserAndDrop" class="flex min-h-0 flex-1 flex-col gap-1">
      <span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Files
      </span>
      <FileBrowser
        compact
        mode="open"
        :busy="busy"
        @open="onBrowserOpen"
      />
    </div>

    <div
      v-if="showBrowserAndDrop"
      class="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-dashed border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted"
      @click="triggerFileUpload"
      @drop="handleFileDrop"
      @dragover.prevent
    >
      <input
        ref="fileInput"
        type="file"
        accept=".json"
        class="hidden"
        @change="handleFileSelect"
      >
      <FolderOpenIcon class="shrink-0 text-muted-foreground" :size="16" />
      <span>Drop JSON or click to browse</span>
    </div>

    <div
      v-if="hasPending"
      class="flex shrink-0 flex-col gap-2 rounded-sm border border-border bg-muted/40 p-2"
    >
      <div class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {{ settingsTitle }}
        </span>
        <span
          class="truncate font-mono text-[11px] text-muted-foreground"
          :title="pendingDiagramLoad?.label"
        >
          {{ pendingDiagramLoad?.label }}
          <template v-if="pendingDiagramLoad">
            ({{ pendingDiagramLoad.kind }})
          </template>
        </span>
      </div>

      <FieldGroup
        class="w-full !grid !gap-2"
        :class="needsLayout || needsSourceDiagram ? 'grid-cols-2' : 'grid-cols-1'"
      >
        <Field v-if="needsSourceDiagram" class="min-w-0 gap-1">
          <FieldLabel for="add-source-diagram" class="text-xs">
            Diagram in file
          </FieldLabel>
          <Select
            :model-value="sourceDiagramId"
            @update:model-value="onSourceDiagramUpdate"
          >
            <SelectTrigger
              id="add-source-diagram"
              size="sm"
              class="h-7! w-full min-w-0 rounded-sm px-2 py-0 text-xs"
            >
              <SelectValue placeholder="Select diagram" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="id in projectDiagramIds"
                :key="id"
                :value="id"
              >
                {{ id }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FieldError v-if="sourceDiagramError" class="text-[11px]">
            {{ sourceDiagramError }}
          </FieldError>
        </Field>

        <Field class="min-w-0 gap-1">
          <FieldLabel for="welcome-diagram-id" class="text-xs">
            Diagram id
          </FieldLabel>
          <Input
            id="welcome-diagram-id"
            v-model="diagramIdInput"
            type="text"
            class="h-7 w-full min-w-0 rounded-sm px-2 py-0 text-xs"
            :placeholder="isAddMode ? 'unique id in this project' : MAIN_DIAGRAM_ID"
            :title="
              isAddMode
                ? 'Must be unique in the current project'
                : 'Suggested root id (editable); stored as mainDiagramId'
            "
            autocomplete="off"
            spellcheck="false"
          />
          <FieldError v-if="diagramIdError" class="text-[11px]">
            {{ diagramIdError }}
          </FieldError>
        </Field>

        <Field v-if="needsLayout" class="min-w-0 gap-1">
          <FieldLabel for="direct-children-layout" class="text-xs">
            Graph layout
          </FieldLabel>
          <Select :model-value="layoutMode" @update:model-value="onLayoutModeUpdate">
            <SelectTrigger
              id="direct-children-layout"
              size="sm"
              class="h-7! w-full min-w-0 rounded-sm px-2 py-0 text-xs"
              title="Applied when parsing raw animgraph JSON"
            >
              <SelectValue placeholder="Layout mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tidy-tree">Tidy tree (Reingold–Tilford)</SelectItem>
              <SelectItem value="elk-compound">ELK compound (layered)</SelectItem>
              <SelectItem value="cola-flow">Cola flow (directed tree)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>

      <div class="flex justify-end gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          class="rounded-sm"
          @click="onCancelPending"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          class="rounded-sm"
          :disabled="busy || !canConfirmLoad"
          @click="onConfirmLoad"
        >
          {{ isAddMode ? 'Add' : 'Load' }}
        </Button>
      </div>
    </div>
  </div>
</template>
