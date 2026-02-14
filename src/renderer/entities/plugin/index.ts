export { usePluginStore } from './model/plugin-store'
export type {
  Plugin,
  PluginCapabilities,
  PluginSyncState
} from './model/plugin.types'
export type { AvailablePlugin } from './api/plugin-ipc'
export {
  discoverAvailablePlugins,
  installPlugin as installPluginApi
} from './api/plugin-ipc'
