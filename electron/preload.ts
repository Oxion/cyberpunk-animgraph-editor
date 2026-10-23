import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,

  getDefaultRoot: () => ipcRenderer.invoke('fs:getDefaultRoot') as Promise<string>,
  list: (dirPath: string | null) => ipcRenderer.invoke('fs:list', dirPath),
  listDrives: () => ipcRenderer.invoke('fs:listDrives'),
  readText: (filePath: string) => ipcRenderer.invoke('fs:readText', filePath) as Promise<string>,
  writeText: (filePath: string, text: string) =>
    ipcRenderer.invoke('fs:writeText', filePath, text) as Promise<void>,
  mkdir: (folderPath: string) => ipcRenderer.invoke('fs:mkdir', folderPath),
  delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),

  getPathForFile: (file: File): string | null => {
    try {
      const p = webUtils.getPathForFile(file)
      return p || null
    } catch {
      return null
    }
  },

  windowMinimize: () => ipcRenderer.invoke('window:minimize') as Promise<void>,
  windowMaximize: () => ipcRenderer.invoke('window:maximize') as Promise<void>,
  windowClose: () => ipcRenderer.invoke('window:close') as Promise<void>,
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,

  onTryClose: (handler: () => boolean) => {
    const listener = () => {
      let allowed = true
      try {
        allowed = handler()
      } catch {
        allowed = false
      }
      ipcRenderer.send('app:try-close-result', Boolean(allowed))
    }
    ipcRenderer.on('app:try-close', listener)
    return () => {
      ipcRenderer.removeListener('app:try-close', listener)
    }
  },

  onMaximizedChanged: (handler: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => {
      handler(Boolean(maximized))
    }
    ipcRenderer.on('window:maximized-changed', listener)
    return () => {
      ipcRenderer.removeListener('window:maximized-changed', listener)
    }
  },

  liveBridgeStart: () =>
    ipcRenderer.invoke('live-bridge:start') as Promise<{ enabled: boolean; connected: boolean }>,
  liveBridgeStop: () =>
    ipcRenderer.invoke('live-bridge:stop') as Promise<{ enabled: boolean; connected: boolean }>,
  liveBridgeStatus: () =>
    ipcRenderer.invoke('live-bridge:status') as Promise<{ enabled: boolean; connected: boolean }>,

  onLiveBridgeLine: (handler: (line: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, line: string) => {
      handler(String(line ?? ''))
    }
    ipcRenderer.on('live-bridge:line', listener)
    return () => {
      ipcRenderer.removeListener('live-bridge:line', listener)
    }
  },

  onLiveBridgeStatus: (handler: (status: { enabled: boolean; connected: boolean }) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: { enabled: boolean; connected: boolean }
    ) => {
      handler(status)
    }
    ipcRenderer.on('live-bridge:status', listener)
    return () => {
      ipcRenderer.removeListener('live-bridge:status', listener)
    }
  },
})
