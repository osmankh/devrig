import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'path'
import { enforceCSP } from './csp'
import { configurePermissions } from './permissions'
import { configureNavigationGuards } from './navigation-guard'
import { secureHandle } from './ipc-security'
import { openDatabase, closeDatabase } from './db/connection'
import {
  WorkspaceRepository,
  WorkflowRepository,
  NodeRepository,
  EdgeRepository,
  ExecutionRepository,
  SettingsRepository
} from './db/repositories'
import { registerDbHandlers } from './ipc/db-handlers'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#0f0f0f',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      preload: join(__dirname, '../preload/index.js')
    }
  })

  configureNavigationGuards(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerSystemHandlers(): void {
  secureHandle('system:getAppVersion', () => {
    return app.getVersion()
  })

  secureHandle('system:getPlatform', () => {
    return process.platform
  })

  secureHandle('theme:get-native-theme', () => {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  })
}

function initDatabase(): void {
  const db = openDatabase()
  const repos = {
    workspace: new WorkspaceRepository(db),
    workflow: new WorkflowRepository(db),
    node: new NodeRepository(db),
    edge: new EdgeRepository(db),
    execution: new ExecutionRepository(db),
    settings: new SettingsRepository(db)
  }
  registerDbHandlers(repos)
}

app.whenReady().then(() => {
  enforceCSP()
  configurePermissions()
  registerSystemHandlers()
  initDatabase()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
