import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true as const,

  getDefaultRoot: () => ipcRenderer.invoke('fs:getDefaultRoot') as Promise<string>,
  list: (dirPath: string | null) => ipcRenderer.invoke('fs:list', dirPath),
  listDrives: () => ipcRenderer.invoke('fs:listDrives'),
  loadJson: (filePath: string) => ipcRenderer.invoke('fs:loadJson', filePath),
  saveJson: (filePath: string, data: unknown) =>
    ipcRenderer.invoke('fs:saveJson', filePath, data),
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
})
