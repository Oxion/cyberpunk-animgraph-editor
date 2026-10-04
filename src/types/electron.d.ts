import type { FsEntry, FsListResult } from './FsEntry'

export interface ElectronFsApi {
  isElectron: true
  getDefaultRoot: () => Promise<string>
  list: (dirPath: string | null) => Promise<FsListResult>
  listDrives: () => Promise<FsEntry[]>
  readText: (filePath: string) => Promise<string>
  writeText: (filePath: string, text: string) => Promise<void>
  mkdir: (folderPath: string) => Promise<void>
  delete: (targetPath: string) => Promise<void>
  getPathForFile: (file: File) => string | null
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>
  onTryClose: (handler: () => boolean) => () => void
  onMaximizedChanged: (handler: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronFsApi
  }
}

export {}
