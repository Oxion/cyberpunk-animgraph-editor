import type { FsEntry, FsListResult } from '../types/FsEntry'
import { isElectron } from '../utils/platform'

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = response.statusText
    try {
      const body = (await response.json()) as { error?: string; details?: string }
      message = body.details || body.error || message
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

const browserFs = {
  async getDefaultRoot(): Promise<string> {
    const data = await readJson<{ path: string }>(await fetch('/api/fs/default-root'))
    return data.path
  },

  async list(dirPath: string | null): Promise<FsListResult> {
    const q =
      dirPath == null || dirPath === '__drives__'
        ? 'path=__drives__'
        : `path=${encodeURIComponent(dirPath)}`
    return readJson<FsListResult>(await fetch(`/api/fs/list?${q}`))
  },

  async loadJson(filePath: string): Promise<unknown> {
    return readJson<unknown>(
      await fetch(`/api/fs/load?path=${encodeURIComponent(filePath)}`)
    )
  },

  async saveText(filePath: string, text: string): Promise<void> {
    await readJson(
      await fetch(`/api/fs/save?path=${encodeURIComponent(filePath)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      })
    )
  },

  async saveJson(filePath: string, data: unknown, opts?: FsSaveJsonOptions): Promise<void> {
    const pretty = opts?.pretty !== false
    await browserFs.saveText(
      filePath,
      pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
    )
  },

  async mkdir(folderPath: string): Promise<void> {
    await readJson(
      await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      })
    )
  },

  async delete(targetPath: string): Promise<void> {
    await readJson(
      await fetch(`/api/fs?path=${encodeURIComponent(targetPath)}`, { method: 'DELETE' })
    )
  },

  async listDrives(): Promise<FsEntry[]> {
    return readJson<FsEntry[]>(await fetch('/api/fs/drives'))
  },
}

function electronFs() {
  const api = window.electronAPI
  if (!api) throw new Error('electronAPI is not available')
  return api
}

export async function fsGetDefaultRoot(): Promise<string> {
  if (isElectron()) return electronFs().getDefaultRoot()
  return browserFs.getDefaultRoot()
}

export async function fsList(dirPath: string | null): Promise<FsListResult> {
  if (isElectron()) return electronFs().list(dirPath)
  return browserFs.list(dirPath)
}

export async function fsLoadJson(filePath: string): Promise<unknown> {
  if (isElectron()) {
    const text = await electronFs().readText(filePath)
    return JSON.parse(text) as unknown
  }
  return browserFs.loadJson(filePath)
}

export type FsSaveJsonOptions = {
  /** Default true. Use false for large binary-ish payloads (clip poses). */
  pretty?: boolean
}

export async function fsSaveText(filePath: string, text: string): Promise<void> {
  if (isElectron()) {
    await electronFs().writeText(filePath, text)
    return
  }
  return browserFs.saveText(filePath, text)
}

export async function fsSaveJson(
  filePath: string,
  data: unknown,
  opts?: FsSaveJsonOptions
): Promise<void> {
  const pretty = opts?.pretty !== false
  const text = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  if (isElectron()) {
    await electronFs().writeText(filePath, text)
    return
  }
  return browserFs.saveText(filePath, text)
}

export async function fsMkdir(folderPath: string): Promise<void> {
  if (isElectron()) return electronFs().mkdir(folderPath)
  return browserFs.mkdir(folderPath)
}

export async function fsDelete(targetPath: string): Promise<void> {
  if (isElectron()) return electronFs().delete(targetPath)
  return browserFs.delete(targetPath)
}

export async function fsListDrives(): Promise<FsEntry[]> {
  if (isElectron()) return electronFs().listDrives()
  return browserFs.listDrives()
}

/** Absolute path for a dropped/picked File in Electron; always null in the browser. */
export function getPathForFile(file: File): string | null {
  if (!isElectron()) return null
  try {
    return electronFs().getPathForFile(file)
  } catch {
    return null
  }
}
