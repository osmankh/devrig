import ivm from 'isolated-vm'
import { type PluginPermissions, isUrlAllowed } from './permissions'

const MEMORY_LIMIT_MB = 128
const EXECUTION_TIMEOUT_MS = 5000

export interface HostFunctions {
  fetch: (pluginId: string, url: string, options: unknown) => Promise<unknown>
  getSecret: (pluginId: string, key: string) => Promise<string | null>
  storeItems: (pluginId: string, items: unknown[]) => Promise<void>
  queryItems: (pluginId: string, filter: unknown) => Promise<unknown[]>
  markRead: (pluginId: string, ids: string[]) => Promise<void>
  archive: (pluginId: string, ids: string[]) => Promise<void>
  emitEvent: (pluginId: string, name: string, data: unknown) => void
  requestAI: (pluginId: string, operation: string, params: unknown) => Promise<unknown>
}

export class PluginSandbox {
  private isolate: ivm.Isolate
  private context: ivm.Context | null = null
  private pluginId: string
  private permissions: PluginPermissions
  private hostFns: HostFunctions
  private disposed = false

  constructor(pluginId: string, permissions: PluginPermissions, hostFns: HostFunctions) {
    this.pluginId = pluginId
    this.permissions = permissions
    this.hostFns = hostFns
    this.isolate = new ivm.Isolate({
      memoryLimit: MEMORY_LIMIT_MB,
      inspector: false
    })
  }

  async initialize(): Promise<void> {
    this.context = await this.isolate.createContext()
    const jail = this.context.global

    await jail.set('global', jail.derefInto())

    await this.injectHostFunctions(jail)
  }

  private async injectHostFunctions(jail: ivm.Reference<Record<string | number | symbol, unknown>>): Promise<void> {
    const pluginId = this.pluginId
    const permissions = this.permissions
    const hostFns = this.hostFns

    // __hostLog — always available
    await jail.set(
      '__hostLog',
      new ivm.Callback((level: string, message: string) => {
        const safe = String(message).slice(0, 2000)
        const safeLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info'
        console.log(`[plugin:${pluginId}][${safeLevel}] ${safe}`)
      })
    )

    // __hostFetch — only if network permissions declared
    await jail.set(
      '__hostFetch',
      new ivm.Callback(
        (urlStr: string, optionsJson: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          if (permissions.network.length === 0) {
            reject.applySync(undefined, ['No network permission'])
            return
          }
          if (!isUrlAllowed(urlStr, permissions.network)) {
            reject.applySync(undefined, [`Network access denied for URL: ${urlStr}`])
            return
          }
          const options = optionsJson ? JSON.parse(optionsJson) : {}
          hostFns
            .fetch(pluginId, urlStr, options)
            .then((result) => resolve.applySync(undefined, [JSON.stringify(result)]))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // __hostGetSecret — only if key is in permissions.secrets
    await jail.set(
      '__hostGetSecret',
      new ivm.Callback(
        (key: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          if (!permissions.secrets.includes(key)) {
            reject.applySync(undefined, [`Secret access denied for key: ${key}`])
            return
          }
          hostFns
            .getSecret(pluginId, key)
            .then((val) => resolve.applySync(undefined, [val ?? '']))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // __hostStoreItems — always available
    await jail.set(
      '__hostStoreItems',
      new ivm.Callback(
        (itemsJson: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          const items = JSON.parse(itemsJson) as unknown[]
          hostFns
            .storeItems(pluginId, items)
            .then(() => resolve.applySync(undefined, ['']))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // __hostQueryItems — always available, scoped to pluginId
    await jail.set(
      '__hostQueryItems',
      new ivm.Callback(
        (filterJson: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          const filter = filterJson ? JSON.parse(filterJson) : {}
          hostFns
            .queryItems(pluginId, filter)
            .then((result) => resolve.applySync(undefined, [JSON.stringify(result)]))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // __hostMarkRead — always available, scoped to pluginId
    await jail.set(
      '__hostMarkRead',
      new ivm.Callback(
        (idsJson: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          const ids = JSON.parse(idsJson) as string[]
          hostFns
            .markRead(pluginId, ids)
            .then(() => resolve.applySync(undefined, ['']))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // __hostArchive — always available, scoped to pluginId
    await jail.set(
      '__hostArchive',
      new ivm.Callback(
        (idsJson: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          const ids = JSON.parse(idsJson) as string[]
          hostFns
            .archive(pluginId, ids)
            .then(() => resolve.applySync(undefined, ['']))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // __hostEmitEvent — always available
    await jail.set(
      '__hostEmitEvent',
      new ivm.Callback((name: string, dataJson: string) => {
        const data = dataJson ? JSON.parse(dataJson) : undefined
        hostFns.emitEvent(pluginId, name, data)
      })
    )

    // __hostRequestAI — only if ai permission
    await jail.set(
      '__hostRequestAI',
      new ivm.Callback(
        (operation: string, paramsJson: string, resolve: ivm.Reference<(v: string) => void>, reject: ivm.Reference<(v: string) => void>) => {
          if (!permissions.ai) {
            reject.applySync(undefined, ['AI permission not granted'])
            return
          }
          const params = paramsJson ? JSON.parse(paramsJson) : {}
          hostFns
            .requestAI(pluginId, operation, params)
            .then((result) => resolve.applySync(undefined, [JSON.stringify(result)]))
            .catch((err: Error) => reject.applySync(undefined, [err.message]))
        },
        { async: true }
      )
    )

    // Inject JS wrappers that provide a Promise-based API to plugin code
    await this.context!.eval(
      `
      globalThis.devrig = {
        log(level, message) { __hostLog(level, message); },

        fetch(url, options) {
          return new Promise((resolve, reject) => {
            __hostFetch(url, options ? JSON.stringify(options) : '', resolve, reject);
          }).then(r => r ? JSON.parse(r) : null);
        },

        getSecret(key) {
          return new Promise((resolve, reject) => {
            __hostGetSecret(key, resolve, reject);
          }).then(r => r || null);
        },

        storeItems(items) {
          return new Promise((resolve, reject) => {
            __hostStoreItems(JSON.stringify(items), resolve, reject);
          });
        },

        queryItems(filter) {
          return new Promise((resolve, reject) => {
            __hostQueryItems(filter ? JSON.stringify(filter) : '', resolve, reject);
          }).then(r => r ? JSON.parse(r) : []);
        },

        markRead(ids) {
          return new Promise((resolve, reject) => {
            __hostMarkRead(JSON.stringify(ids), resolve, reject);
          });
        },

        archive(ids) {
          return new Promise((resolve, reject) => {
            __hostArchive(JSON.stringify(ids), resolve, reject);
          });
        },

        emitEvent(name, data) {
          __hostEmitEvent(name, data ? JSON.stringify(data) : '');
        },

        requestAI(operation, params) {
          return new Promise((resolve, reject) => {
            __hostRequestAI(operation, params ? JSON.stringify(params) : '', resolve, reject);
          }).then(r => r ? JSON.parse(r) : null);
        }
      };
    `,
      { timeout: EXECUTION_TIMEOUT_MS }
    )
  }

  async loadModule(code: string): Promise<void> {
    this.ensureAlive()
    await this.context!.eval(code, { timeout: EXECUTION_TIMEOUT_MS })
  }

  async call<T>(fnName: string, args?: unknown[]): Promise<T> {
    this.ensureAlive()

    // Security: validate function name to prevent injection — only allow
    // alphanumeric, underscores, dots (for namespaced calls like "plugin.onSync")
    if (!/^[\w.]+$/.test(fnName)) {
      throw new Error(`Invalid function name: "${fnName}"`)
    }

    // Security: use evalClosure with $0/$1 arguments instead of string interpolation.
    // This passes data via isolated-vm's transfer mechanism, never as eval'd strings.
    const argsJson = args ? JSON.stringify(args) : '[]'
    const resultJson = await this.context!.evalClosure(
      `
      const fn = globalThis[$0];
      if (typeof fn !== 'function') throw new Error('Function not found: ' + $0);
      const args = JSON.parse($1);
      const result = await fn(...args);
      return JSON.stringify(result === undefined ? null : result);
      `,
      [fnName, argsJson],
      { timeout: EXECUTION_TIMEOUT_MS, promise: true, arguments: { copy: true }, result: { copy: true } }
    ) as string

    return JSON.parse(resultJson) as T
  }

  getMemoryUsage(): { used: number; limit: number } {
    const stats = this.isolate.getHeapStatisticsSync()
    return {
      used: stats.used_heap_size,
      limit: MEMORY_LIMIT_MB * 1024 * 1024
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    try {
      if (this.context) {
        this.context.release()
        this.context = null
      }
      this.isolate.dispose()
    } catch {
      // Isolate may already be disposed
    }
  }

  private ensureAlive(): void {
    if (this.disposed) throw new Error(`Sandbox for plugin "${this.pluginId}" has been disposed`)
    if (!this.context) throw new Error(`Sandbox for plugin "${this.pluginId}" not initialized — call initialize() first`)
  }
}

export async function createSandbox(
  pluginId: string,
  permissions: PluginPermissions,
  hostFns: HostFunctions
): Promise<PluginSandbox> {
  const sandbox = new PluginSandbox(pluginId, permissions, hostFns)
  await sandbox.initialize()
  return sandbox
}
