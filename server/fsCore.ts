import fs from 'fs'
import os from 'os'
import path from 'path'

export type FsListEntry = {
  name: string
  path: string
  kind: 'file' | 'folder'
  size: number
  modified: string
}

export type FsListResult = {
  path: string | null
  parentPath: string | null
  entries: FsListEntry[]
}

export type FsSaveResult = {
  success: true
  path: string
  size: number
  sizeMB: string
}

export class FsCoreError extends Error {
  constructor(
    message: string,
    public readonly code: 'invalid' | 'not_found' | 'conflict' | 'internal'
  ) {
    super(message)
    this.name = 'FsCoreError'
  }
}

export function ensureGraphsRoot(projectRoot: string): string {
  const graphsRoot = path.resolve(projectRoot, 'graphs')
  if (!fs.existsSync(graphsRoot)) {
    fs.mkdirSync(graphsRoot, { recursive: true })
  }
  return graphsRoot
}

export function normalizeAbsolutePath(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  if (raw.includes('\0')) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return path.resolve(trimmed)
}

function isVolumeRoot(absPath: string): boolean {
  const resolved = path.resolve(absPath)
  const parsed = path.parse(resolved)
  return resolved === parsed.root
}

function listWindowsDrives(): FsListEntry[] {
  const now = new Date().toISOString()
  const drives: FsListEntry[] = []
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i)
    const root = `${letter}:\\`
    try {
      fs.accessSync(root, fs.constants.R_OK)
      drives.push({
        name: `${letter}:`,
        path: root,
        kind: 'folder',
        size: 0,
        modified: now,
      })
    } catch {
      // skip inaccessible drive letters
    }
  }
  return drives
}

function listDirectory(absPath: string): FsListEntry[] {
  const entries: FsListEntry[] = []
  for (const name of fs.readdirSync(absPath)) {
    if (name.startsWith('.')) continue
    const full = path.join(absPath, name)
    let st: fs.Stats
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      entries.push({
        name,
        path: full,
        kind: 'folder',
        size: 0,
        modified: st.mtime.toISOString(),
      })
    } else if (name.toLowerCase().endsWith('.json')) {
      entries.push({
        name,
        path: full,
        kind: 'file',
        size: st.size,
        modified: st.mtime.toISOString(),
      })
    }
  }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return entries
}

export function createFsCore(_projectRoot: string) {
  return {
    /** First-open FileBrowser location: Windows drive list, otherwise user home. */
    getDefaultRoot(): string {
      if (process.platform === 'win32') return '__drives__'
      return os.homedir() || '/'
    },

    listDrives(): FsListEntry[] {
      if (process.platform === 'win32') return listWindowsDrives()
      return [
        {
          name: '/',
          path: '/',
          kind: 'folder',
          size: 0,
          modified: new Date().toISOString(),
        },
      ]
    },

    list(dirPath: string | null): FsListResult {
      const raw = dirPath ?? ''
      if (raw === '' || raw === '__drives__') {
        if (process.platform === 'win32') {
          return { path: null, parentPath: null, entries: listWindowsDrives() }
        }
        return { path: '/', parentPath: null, entries: listDirectory('/') }
      }

      const abs = normalizeAbsolutePath(raw)
      if (!abs) throw new FsCoreError('Invalid path', 'invalid')
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
        throw new FsCoreError('Directory not found', 'not_found')
      }

      const parentPath = isVolumeRoot(abs)
        ? process.platform === 'win32'
          ? '__drives__'
          : null
        : path.dirname(abs)

      return {
        path: abs,
        parentPath,
        entries: listDirectory(abs),
      }
    },

    loadJson(filePath: string): unknown {
      const abs = normalizeAbsolutePath(filePath)
      if (!abs) throw new FsCoreError('Path parameter required', 'invalid')
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        throw new FsCoreError('File not found', 'not_found')
      }
      try {
        return JSON.parse(fs.readFileSync(abs, 'utf8'))
      } catch (error) {
        throw new FsCoreError(
          error instanceof Error ? error.message : 'Failed to load file',
          'internal'
        )
      }
    },

    saveJson(filePath: string, data: unknown): FsSaveResult {
      const abs = normalizeAbsolutePath(filePath)
      if (!abs) throw new FsCoreError('Path is required', 'invalid')
      if (data == null) throw new FsCoreError('Data is required', 'invalid')
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        const payload = JSON.stringify(data, null, 2)
        fs.writeFileSync(abs, payload)
        return {
          success: true,
          path: abs,
          size: payload.length,
          sizeMB: (payload.length / 1024 / 1024).toFixed(2),
        }
      } catch (error) {
        throw new FsCoreError(
          error instanceof Error ? error.message : 'Failed to save file',
          'internal'
        )
      }
    },

    mkdir(folderPath: string): { success: true; path: string } {
      const abs = normalizeAbsolutePath(folderPath)
      if (!abs) throw new FsCoreError('Invalid folder path', 'invalid')
      if (fs.existsSync(abs)) throw new FsCoreError('Path already exists', 'conflict')
      try {
        fs.mkdirSync(abs, { recursive: true })
        return { success: true, path: abs }
      } catch (error) {
        throw new FsCoreError(
          error instanceof Error ? error.message : 'Failed to create folder',
          'internal'
        )
      }
    },

    delete(targetPath: string): { success: true; path: string } {
      const abs = normalizeAbsolutePath(targetPath)
      if (!abs) throw new FsCoreError('Path parameter required', 'invalid')
      if (!fs.existsSync(abs)) throw new FsCoreError('Path not found', 'not_found')
      try {
        const st = fs.statSync(abs)
        if (st.isDirectory()) {
          fs.rmSync(abs, { recursive: true, force: true })
        } else {
          fs.unlinkSync(abs)
        }
        return { success: true, path: abs }
      } catch (error) {
        throw new FsCoreError(
          error instanceof Error ? error.message : 'Failed to delete path',
          'internal'
        )
      }
    },
  }
}

export type FsCore = ReturnType<typeof createFsCore>
