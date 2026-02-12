export {
  pluginManifestSchema,
  validateManifest,
  type PluginManifest,
  type PluginAuthor,
  type DataSourceCapability,
  type ActionCapability,
  type ActionParameter,
  type AiPipelineCapability,
  type ViewCapability,
  type FlowNodeCapability,
  type ManifestPermissions,
  type ManifestCapabilities
} from './manifest-schema'

export {
  type PluginPermissions,
  extractPermissions,
  validatePermissions,
  checkPermission,
  isUrlAllowed,
  isPathAllowed,
  describePermissions
} from './permissions'

export {
  type HostFunctions,
  PluginSandbox,
  createSandbox
} from './isolate-sandbox'

export {
  type PluginDescriptor,
  type LoadError,
  PluginLoader
} from './plugin-loader'

export {
  type PluginApiDeps,
  createHostFunctions
} from './plugin-api'

export {
  type PluginStatus,
  type ManagedPlugin,
  type PluginManagerOptions,
  PluginManager
} from './plugin-manager'
