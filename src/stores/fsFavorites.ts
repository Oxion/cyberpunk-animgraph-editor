import { computed, ref } from 'vue'

const RECENT_KEY = 'animgraph-editor.recent.v1'
const BOOKMARKS_KEY = 'animgraph-editor.bookmarks.v1'
const RECENT_MAX = 20

export type RecentFileEntry = {
  path: string
  name: string
}

export type FolderBookmark = {
  path: string
  name: string
}

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function folderLabelFromPath(path: string): string {
  return path.replace(/^.*[/\\]/, '') || path
}

function normalizeRecent(entries: unknown[]): RecentFileEntry[] {
  const out: RecentFileEntry[] = []
  for (const item of entries) {
    if (!item || typeof item !== 'object') continue
    const path = String((item as RecentFileEntry).path ?? '').trim()
    if (!path) continue
    const name =
      String((item as RecentFileEntry).name ?? '').trim() || folderLabelFromPath(path)
    if (out.some((e) => e.path === path)) continue
    out.push({ path, name })
  }
  return out.slice(0, RECENT_MAX)
}

/** Accepts legacy `string[]` and `{ path, name }[]`. */
function normalizeBookmarks(entries: unknown[]): FolderBookmark[] {
  const out: FolderBookmark[] = []
  for (const item of entries) {
    let path = ''
    let name = ''
    if (typeof item === 'string') {
      path = item.trim()
      name = folderLabelFromPath(path)
    } else if (item && typeof item === 'object') {
      path = String((item as FolderBookmark).path ?? '').trim()
      name =
        String((item as FolderBookmark).name ?? '').trim() || folderLabelFromPath(path)
    }
    if (!path || out.some((e) => e.path === path)) continue
    out.push({ path, name })
  }
  return out
}

export const recentFiles = ref<RecentFileEntry[]>(
  normalizeRecent(readJsonArray(RECENT_KEY))
)
export const folderBookmarks = ref<FolderBookmark[]>(
  normalizeBookmarks(readJsonArray(BOOKMARKS_KEY))
)

export const recentFilesList = computed(() => recentFiles.value)
export const folderBookmarksList = computed(() => folderBookmarks.value)

export function pushRecentFile(filePath: string) {
  const path = filePath.trim()
  if (!path) return
  const name = folderLabelFromPath(path)
  const next = [{ path, name }, ...recentFiles.value.filter((e) => e.path !== path)].slice(
    0,
    RECENT_MAX
  )
  recentFiles.value = next
  writeJson(RECENT_KEY, next)
}

export function addFolderBookmark(folderPath: string, name?: string) {
  const path = folderPath.trim()
  if (!path || path === '__drives__') return
  if (folderBookmarks.value.some((b) => b.path === path)) return
  const next = [
    { path, name: (name ?? '').trim() || folderLabelFromPath(path) },
    ...folderBookmarks.value,
  ]
  folderBookmarks.value = next
  writeJson(BOOKMARKS_KEY, next)
}

export function removeFolderBookmark(folderPath: string) {
  const next = folderBookmarks.value.filter((b) => b.path !== folderPath)
  folderBookmarks.value = next
  writeJson(BOOKMARKS_KEY, next)
}

export function renameFolderBookmark(folderPath: string, name: string) {
  const path = folderPath.trim()
  const nextName = name.trim() || folderLabelFromPath(path)
  const next = folderBookmarks.value.map((b) =>
    b.path === path ? { ...b, name: nextName } : b
  )
  folderBookmarks.value = next
  writeJson(BOOKMARKS_KEY, next)
}

export function isFolderBookmarked(folderPath: string): boolean {
  return folderBookmarks.value.some((b) => b.path === folderPath)
}
