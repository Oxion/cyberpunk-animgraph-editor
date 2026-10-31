import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type Input,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { createFsCore, FsCoreError } from '../server/fsCore'
import {
  createLiveBridgeTcp,
  type LiveBridgeTcpSettings,
} from '../server/liveBridgeTcp'

const isDev = !app.isPackaged
/** App root: repo root in dev, asar/app path when packaged. */
const appRoot = isDev ? path.resolve(__dirname, '..') : app.getAppPath()
/** Writable root for `graphs/` (asar is read-only when packaged). */
const dataRoot = isDev ? appRoot : app.getPath('userData')
const fsCore = createFsCore(dataRoot)

let mainWindow: BrowserWindow | null = null
let allowClose = false

const liveBridge = createLiveBridgeTcp({
  onLine: (line) => {
    mainWindow?.webContents.send('live-bridge:line', line)
  },
  onStatus: (status) => {
    mainWindow?.webContents.send('live-bridge:status', status)
  },
})

function wrapFs<T>(fn: () => T): T {
  try {
    return fn()
  } catch (error) {
    if (error instanceof FsCoreError) throw new Error(error.message)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

function registerFsIpc() {
  ipcMain.handle('fs:getDefaultRoot', () => wrapFs(() => fsCore.getDefaultRoot()))
  ipcMain.handle('fs:list', (_e, dirPath: string | null) => wrapFs(() => fsCore.list(dirPath)))
  ipcMain.handle('fs:listDrives', () => wrapFs(() => fsCore.listDrives()))
  // Text only — JSON parse/stringify stays in the renderer (contextBridge depth limit).
  ipcMain.handle('fs:readText', (_e, filePath: string) => wrapFs(() => fsCore.readText(filePath)))
  ipcMain.handle('fs:writeText', (_e, filePath: string, text: string) =>
    wrapFs(() => {
      fsCore.writeText(filePath, text)
    })
  )
  ipcMain.handle('fs:mkdir', (_e, folderPath: string) =>
    wrapFs(() => {
      fsCore.mkdir(folderPath)
    })
  )
  ipcMain.handle('fs:delete', (_e, targetPath: string) =>
    wrapFs(() => {
      fsCore.delete(targetPath)
    })
  )
}

function registerWindowIpc() {
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
  })
  ipcMain.handle('window:close', () => {
    mainWindow?.close()
  })
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()))
}

function registerLiveBridgeIpc() {
  ipcMain.handle('live-bridge:start', (_e, settings?: Partial<LiveBridgeTcpSettings>) => {
    return liveBridge.start(settings)
  })
  ipcMain.handle('live-bridge:stop', () => {
    return liveBridge.stop()
  })
  ipcMain.handle('live-bridge:status', () => liveBridge.getStatus())
}

function isCloseChord(input: Input): boolean {
  const key = (input.key || '').toLowerCase()
  if (key !== 'w') return false
  if (process.platform === 'darwin') return Boolean(input.meta)
  return Boolean(input.control)
}

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(appRoot, 'buildResources', 'icon.ico'),
    path.join(appRoot, 'buildResources', 'icon.png'),
    path.join(appRoot, 'icon.ico'),
    path.join(appRoot, 'icon.png'),
  ]
  return candidates.find((p) => fs.existsSync(p))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    frame: false,
    icon: resolveAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (isCloseChord(input)) {
      event.preventDefault()
      return
    }
    // Menu is null + renderer hotkeys eat chords — toggle DevTools in main process.
    if (input.type !== 'keyDown') return
    const key = (input.key || '').toLowerCase()
    if (key === 'f12' || (Boolean(input.control) && Boolean(input.shift) && key === 'i')) {
      event.preventDefault()
      mainWindow?.webContents.toggleDevTools()
    }
  })

  mainWindow.on('close', (event) => {
    if (allowClose || !mainWindow) return
    event.preventDefault()
    mainWindow.webContents.send('app:try-close')
  })

  ipcMain.removeAllListeners('app:try-close-result')
  ipcMain.on('app:try-close-result', (_event, allowed: boolean) => {
    if (!allowed || !mainWindow) return
    allowClose = true
    mainWindow.close()
  })

  const sendMaximized = () => {
    mainWindow?.webContents.send('window:maximized-changed', Boolean(mainWindow?.isMaximized()))
  }
  mainWindow.on('maximize', sendMaximized)
  mainWindow.on('unmaximize', sendMaximized)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    sendMaximized()
  })

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5001')
  } else {
    void mainWindow.loadFile(path.join(appRoot, 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    allowClose = false
  })
}

app.whenReady().then(() => {
  registerFsIpc()
  registerWindowIpc()
  registerLiveBridgeIpc()
  // Live bridge stays idle until renderer calls liveBridgeStart().
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  liveBridge.stop()
  if (process.platform !== 'darwin') app.quit()
})
