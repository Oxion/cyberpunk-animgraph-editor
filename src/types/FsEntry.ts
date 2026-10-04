export type FsEntryKind = 'file' | 'folder'

export interface FsEntry {
  name: string
  path: string
  kind: FsEntryKind
  size: number
  modified: string
}

export interface FsListResult {
  path: string | null
  parentPath: string | null
  entries: FsEntry[]
}
