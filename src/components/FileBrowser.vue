<template>
  <div class="flex w-full min-h-0 min-w-0 flex-1 flex-col gap-1.5 overflow-hidden">
    <div class="flex min-w-0 shrink-0 items-center gap-1.5">
      <Button
        type="button"
        size="icon-xs"
        variant="secondary"
        class="shrink-0 rounded-sm"
        :disabled="busy || (atDrives && parentPath == null)"
        title="Parent folder"
        @click="goParent"
      >
        <CornerLeftUp :size="14" />
      </Button>
      <Input
        v-model="pathDraft"
        type="text"
        class="h-7 min-w-0 flex-1 rounded-sm font-mono text-xs"
        placeholder="Folder path…"
        spellcheck="false"
        autocomplete="off"
        :disabled="busy"
        @keydown.enter.prevent="commitPath"
      />
      <Button
        type="button"
        size="icon-xs"
        variant="secondary"
        class="shrink-0 rounded-sm"
        :disabled="busy || !cwd || cwd === '__drives__'"
        :title="bookmarked ? 'Remove bookmark' : 'Bookmark folder'"
        @click="toggleBookmark"
      >
        <Star :size="14" :fill="bookmarked ? 'currentColor' : 'none'" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        :variant="manageMode ? 'default' : 'secondary'"
        class="shrink-0 rounded-sm"
        title="Manage"
        :aria-pressed="manageMode"
        @click="manageMode = !manageMode"
      >
        <Settings2 :size="14" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="secondary"
        class="shrink-0 rounded-sm"
        :disabled="busy"
        title="Refresh"
        @click="refresh"
      >
        <RefreshCw :size="14" />
      </Button>
    </div>

    <div
      v-if="bookmarks.length"
      class="flex max-h-16 min-w-0 shrink-0 flex-wrap gap-1 overflow-x-hidden overflow-y-auto"
    >
      <div
        v-for="bm in bookmarks"
        :key="bm.path"
        class="flex min-w-0 max-w-full items-center gap-1"
        :class="manageMode ? 'min-w-[140px] max-w-[calc(50%-4px)] flex-[1_1_calc(50%-4px)]' : ''"
      >
        <template v-if="manageMode">
          <Input
            :model-value="bookmarkNameDrafts[bm.path] ?? bm.name"
            type="text"
            class="h-6! min-w-0 flex-1 rounded-sm text-xs"
            :title="bm.path"
            :disabled="busy"
            @update:model-value="onBookmarkNameInput(bm.path, $event)"
            @keydown.enter.prevent="commitBookmarkName(bm.path)"
            @blur="commitBookmarkName(bm.path)"
          />
          <Button
            type="button"
            size="icon-xs"
            variant="destructive"
            class="shrink-0 rounded-sm"
            title="Remove bookmark"
            :disabled="busy"
            @click="removeFolderBookmark(bm.path)"
          >
            <Trash2 :size="14" />
          </Button>
        </template>
        <button
          v-else
          type="button"
          class="max-w-[140px] cursor-pointer truncate rounded-sm border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted disabled:cursor-default"
          :title="bm.path"
          :disabled="busy"
          @click="navigateTo(bm.path)"
        >
          {{ bm.name }}
        </button>
      </div>
    </div>

    <div class="flex min-w-0 shrink-0 items-center gap-1.5">
      <Input
        v-model="search"
        type="search"
        placeholder="Filter current folder…"
        class="h-7 rounded-sm text-xs"
        :disabled="busy"
      />
    </div>

    <div
      v-if="manageMode && cwd && cwd !== '__drives__'"
      class="flex min-w-0 shrink-0 items-center gap-1.5"
    >
      <Input
        v-model="newFolderName"
        type="text"
        placeholder="New folder name"
        class="h-7 min-w-0 flex-1 rounded-sm text-xs"
        :disabled="busy"
        @keydown.enter.prevent="submitCreateFolder"
      />
      <Button
        type="button"
        size="xs"
        class="rounded-sm"
        :disabled="busy || !newFolderName.trim()"
        @click="submitCreateFolder"
      >
        New folder
      </Button>
    </div>

    <div
      class="min-h-20 min-w-0 flex-[1_1_auto] overflow-x-hidden overflow-y-auto rounded-sm border border-border bg-background"
      :class="compact ? 'min-h-[100px]' : ''"
    >
      <div v-if="error" class="px-2.5 py-3 text-center text-xs text-destructive">
        {{ error }}
      </div>
      <div
        v-else-if="busy && entries.length === 0"
        class="px-2.5 py-3 text-center text-xs text-muted-foreground"
      >
        Loading…
      </div>
      <div
        v-else-if="visibleEntries.length === 0"
        class="px-2.5 py-3 text-center text-xs text-muted-foreground"
      >
        {{ search.trim() ? 'No matches' : 'Empty folder' }}
      </div>
      <template v-else>
        <div
          v-for="entry in visibleEntries"
          :key="entry.path"
          class="box-border flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 border-b border-border px-2 py-1 text-foreground hover:bg-muted"
          :class="selectedPath === entry.path ? 'bg-accent text-accent-foreground' : ''"
          @click="onSelect(entry)"
          @dblclick="onDblClick(entry)"
        >
          <Folder
            v-if="entry.kind === 'folder'"
            class="shrink-0 text-muted-foreground"
            :size="14"
          />
          <FileJson v-else class="shrink-0 text-muted-foreground" :size="14" />
          <div class="min-w-0 flex-[1_1_0%] overflow-hidden">
            <div class="truncate text-xs font-medium" :title="entry.path">
              {{ entry.name }}
            </div>
            <div
              v-if="entry.kind === 'file'"
              class="truncate font-mono text-[10px] text-muted-foreground"
            >
              {{ formatSize(entry.size) }}
            </div>
          </div>
          <div
            v-if="mode === 'open' && entry.kind === 'file' && selectedPath === entry.path"
            class="flex shrink-0 gap-1"
            @click.stop
          >
            <Button
              type="button"
              size="xs"
              class="rounded-sm"
              :disabled="busy"
              @click="emitOpen"
            >
              Open
            </Button>
          </div>
          <div v-if="manageMode" class="flex shrink-0 gap-1" @click.stop>
            <Button
              type="button"
              size="xs"
              variant="destructive"
              class="rounded-sm"
              :disabled="busy"
              @click="onDelete(entry)"
            >
              Delete
            </Button>
          </div>
        </div>
      </template>
    </div>

    <div
      v-if="mode === 'save-as'"
      class="mt-0.5 flex min-w-0 shrink-0 items-center gap-1.5"
    >
      <Input
        v-model="saveName"
        type="text"
        placeholder="filename.json"
        class="h-8 min-w-0 flex-1 rounded-sm text-xs"
        :disabled="busy || !cwd || cwd === '__drives__'"
        @keydown.enter.prevent="emitConfirm"
      />
      <Button
        type="button"
        size="sm"
        class="rounded-sm"
        :disabled="busy || !canConfirmSave"
        @click="emitConfirm"
      >
        Save
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { CornerLeftUp, FileJson, Folder, RefreshCw, Settings2, Star, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fsDelete, fsGetDefaultRoot, fsList, fsMkdir } from '../api/fsApi'
import type { FsEntry } from '../types/FsEntry'
import {
  addFolderBookmark,
  folderBookmarks,
  isFolderBookmarked,
  removeFolderBookmark,
  renameFolderBookmark,
} from '../stores/fsFavorites'

const props = withDefaults(
  defineProps<{
    mode?: 'open' | 'save-as'
    compact?: boolean
    busy?: boolean
    initialPath?: string | null
    /** Prefill filename field in save-as mode. */
    initialSaveName?: string | null
  }>(),
  {
    mode: 'open',
    compact: false,
    busy: false,
    initialPath: null,
    initialSaveName: null,
  }
)

const emit = defineEmits<{
  open: [path: string]
  confirm: [path: string]
  'update:busy': [value: boolean]
}>()

const cwd = ref<string | null>(null)
const parentPath = ref<string | null>(null)
const pathDraft = ref('')
const entries = ref<FsEntry[]>([])
const selectedPath = ref<string | null>(null)
const search = ref('')
const manageMode = ref(false)
const newFolderName = ref('')
const saveName = ref('')
const error = ref('')
const internalBusy = ref(false)

const busy = computed(() => props.busy || internalBusy.value)
const atDrives = computed(() => cwd.value == null || cwd.value === '__drives__')
const bookmarks = computed(() => folderBookmarks.value)
const bookmarked = computed(() => {
  const path = cwd.value
  return Boolean(path && path !== '__drives__' && isFolderBookmarked(path))
})

const selectedEntry = computed(() =>
  entries.value.find((e) => e.path === selectedPath.value) ?? null
)
const selectedFile = computed(() =>
  selectedEntry.value?.kind === 'file' ? selectedEntry.value : null
)

const visibleEntries = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return entries.value
  return entries.value.filter((e) => e.name.toLowerCase().includes(q))
})

const canConfirmSave = computed(() => {
  if (!cwd.value || cwd.value === '__drives__') return false
  return Boolean(saveName.value.trim())
})

watch(
  () => props.initialPath,
  (path) => {
    if (path) void navigateTo(path)
  }
)

watch(
  () => props.initialSaveName,
  (name) => {
    if (props.mode === 'save-as' && name != null && name !== '') {
      saveName.value = name
    }
  },
  { immediate: true }
)

onMounted(async () => {
  if (props.initialPath) {
    await navigateTo(props.initialPath)
    return
  }
  try {
    setBusy(true)
    const root = await fsGetDefaultRoot()
    await navigateTo(root)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load default folder'
  } finally {
    setBusy(false)
  }
})

function setBusy(value: boolean) {
  internalBusy.value = value
  emit('update:busy', value)
}

const bookmarkNameDrafts = ref<Record<string, string>>({})

watch(
  bookmarks,
  (list) => {
    const next: Record<string, string> = { ...bookmarkNameDrafts.value }
    for (const bm of list) {
      if (next[bm.path] == null) next[bm.path] = bm.name
    }
    for (const key of Object.keys(next)) {
      if (!list.some((b) => b.path === key)) delete next[key]
    }
    bookmarkNameDrafts.value = next
  },
  { immediate: true, deep: true }
)

function onBookmarkNameInput(path: string, value: string | number) {
  bookmarkNameDrafts.value = { ...bookmarkNameDrafts.value, [path]: String(value) }
}

function commitBookmarkName(path: string) {
  const draft = bookmarkNameDrafts.value[path]
  if (draft == null) return
  renameFolderBookmark(path, draft)
}

async function navigateTo(target: string | null) {
  error.value = ''
  try {
    setBusy(true)
    const result = await fsList(target)
    cwd.value = result.path
    parentPath.value = result.parentPath
    pathDraft.value = result.path ?? ''
    entries.value = result.entries
    selectedPath.value = null
    if (props.mode === 'save-as' && selectedFile.value) {
      // keep saveName if user typed
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to list folder'
  } finally {
    setBusy(false)
  }
}

async function refresh() {
  await navigateTo(cwd.value)
}

async function commitPath() {
  const draft = pathDraft.value.trim()
  if (!draft) {
    await navigateTo('__drives__')
    return
  }
  await navigateTo(draft)
}

async function goParent() {
  if (parentPath.value != null) {
    await navigateTo(parentPath.value)
    return
  }
  if (cwd.value && cwd.value !== '__drives__') {
    await navigateTo('__drives__')
  }
}

function onSelect(entry: FsEntry) {
  selectedPath.value = entry.path
  if (props.mode === 'save-as' && entry.kind === 'file') {
    saveName.value = entry.name
  }
}

async function onDblClick(entry: FsEntry) {
  if (entry.kind === 'folder') {
    await navigateTo(entry.path)
  }
}

function emitOpen() {
  if (!selectedFile.value) return
  emit('open', selectedFile.value.path)
}

function emitConfirm() {
  if (!canConfirmSave.value || !cwd.value) return
  let name = saveName.value.trim()
  if (!name) return
  if (!name.toLowerCase().endsWith('.json')) name = `${name}.json`
  const exists = entries.value.some(
    (e) => e.kind === 'file' && e.name.toLowerCase() === name.toLowerCase()
  )
  if (exists && !confirm(`"${name}" already exists. Overwrite?`)) return
  emit('confirm', joinPath(cwd.value, name))
}

function toggleBookmark() {
  const path = cwd.value
  if (!path || path === '__drives__') return
  if (isFolderBookmarked(path)) removeFolderBookmark(path)
  else addFolderBookmark(path)
}

async function submitCreateFolder() {
  const name = newFolderName.value.trim().replace(/[\\/]/g, '')
  if (!name || !cwd.value || cwd.value === '__drives__') return
  const full = joinPath(cwd.value.replace(/[/\\]$/, ''), name)
  try {
    setBusy(true)
    await fsMkdir(full)
    newFolderName.value = ''
    await navigateTo(cwd.value)
  } catch (e) {
    alert(`Failed to create folder: ${e instanceof Error ? e.message : 'Unknown error'}`)
  } finally {
    setBusy(false)
  }
}

async function onDelete(entry: FsEntry) {
  if (!confirm(`Delete "${entry.name}"?`)) return
  try {
    setBusy(true)
    await fsDelete(entry.path)
    await navigateTo(cwd.value)
  } catch (e) {
    alert(`Failed to delete: ${e instanceof Error ? e.message : 'Unknown error'}`)
  } finally {
    setBusy(false)
  }
}

function joinPath(dir: string, name: string): string {
  if (dir.endsWith('\\') || dir.endsWith('/')) return `${dir}${name}`
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  return `${dir}${sep}${name}`
}

function formatSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>
