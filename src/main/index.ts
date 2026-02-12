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
  SettingsRepository,
  SecretsRepository,
  PluginRepository,
  InboxRepository,
  PluginSyncRepository,
  AiOperationsRepository
} from './db/repositories'
import { registerDbHandlers } from './ipc/db-handlers'
import { registerExecutionHandlers } from './ipc/execution-handlers'
import { registerInboxHandlers } from './ipc/inbox-handlers'
import { registerPluginHandlers } from './ipc/plugin-handlers'
import { registerAIHandlers } from './ipc/ai-handlers'
import { SyncScheduler } from './services/sync-scheduler'
import { TriggerScheduler } from './services/trigger-scheduler'
import {
  AIProviderRegistry,
  ClaudeProvider,
  SecretsBridge,
  CostTracker,
  ModelRouter,
  PipelineEngine
} from './ai'
import { PluginManager } from './plugins'
import { setPluginManager as setPluginActionManager } from './services/actions/plugin-executor'

let mainWindow: BrowserWindow | null = null
let syncScheduler: SyncScheduler | null = null
let triggerScheduler: TriggerScheduler | null = null
let pluginManager: PluginManager | null = null

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

  // Phase 1 repos
  const repos = {
    workspace: new WorkspaceRepository(db),
    workflow: new WorkflowRepository(db),
    node: new NodeRepository(db),
    edge: new EdgeRepository(db),
    execution: new ExecutionRepository(db),
    settings: new SettingsRepository(db)
  }

  // Phase 2 repos
  const secrets = new SecretsRepository(db)
  const plugin = new PluginRepository(db)
  const inbox = new InboxRepository(db)
  const pluginSync = new PluginSyncRepository(db)
  const aiOperations = new AiOperationsRepository(db)

  // AI layer
  const secretsBridge = new SecretsBridge(secrets)
  const registry = new AIProviderRegistry()
  const claudeProvider = new ClaudeProvider(secretsBridge.getProviderKeyAsync('claude'))
  registry.register(claudeProvider)

  const costTracker = new CostTracker(aiOperations)
  const modelRouter = new ModelRouter(registry)

  // Configure default model routes (cheapest for classify, balanced for others)
  modelRouter.setRoute('classify', 'claude', 'claude-haiku-3-5')
  modelRouter.setRoute('summarize', 'claude', 'claude-sonnet-4-5')
  modelRouter.setRoute('draft', 'claude', 'claude-sonnet-4-5')
  modelRouter.setRoute('general', 'claude', 'claude-sonnet-4-5')

  // Phase 1 handlers
  registerDbHandlers(repos)
  registerExecutionHandlers(repos, () => mainWindow)

  // Pipeline engine
  const pipelineEngine = new PipelineEngine()

  // Plugin manager
  pluginManager = new PluginManager({
    db,
    pluginsDir: join(app.getPath('userData'), 'plugins')
  })
  pluginManager.initialize().catch((err) => {
    console.error('[plugin-manager] Failed to initialize:', err)
  })
  setPluginActionManager(pluginManager)

  // Sync scheduler
  syncScheduler = new SyncScheduler(
    { plugin, pluginSync, inbox },
    () => mainWindow
  )
  syncScheduler.setPluginManager(pluginManager)
  syncScheduler.start()

  // Phase 2 handlers
  registerInboxHandlers(inbox)
  registerPluginHandlers({ plugin, pluginSync, inbox }, { pluginManager, syncScheduler })
  registerAIHandlers(
    { inbox, aiOperations },
    () => registry.getDefault() ?? null,
    registry
  )

  // Trigger scheduler (interval-based workflow execution)
  triggerScheduler = new TriggerScheduler(
    db,
    { workflow: repos.workflow, execution: repos.execution },
    () => mainWindow
  )
  triggerScheduler.start()
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
  triggerScheduler?.stop()
  syncScheduler?.stop()
  pluginManager?.dispose()
  closeDatabase()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
