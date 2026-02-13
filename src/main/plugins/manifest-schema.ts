import { z } from 'zod'

const semverRegex = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/
const pluginIdRegex = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/

const authorSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  url: z.string().url().optional()
})

const dataSourceSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  entryPoint: z.string().min(1),
  syncInterval: z.number().int().min(10).max(86400).optional(),
  description: z.string().max(500).optional()
})

const actionParameterSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string().max(500).optional(),
  required: z.boolean().optional()
})

const actionSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  entryPoint: z.string().min(1),
  description: z.string().max(500).optional(),
  parameters: z.record(z.string(), actionParameterSchema).optional()
})

const aiPipelineSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  entryPoint: z.string().min(1),
  trigger: z.enum(['onNewItems', 'onAction', 'manual']),
  description: z.string().max(500).optional()
})

const viewSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  entryPoint: z.string().min(1),
  target: z.enum(['detail-panel', 'settings', 'dashboard']),
  description: z.string().max(500).optional()
})

const flowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(100),
  entryPoint: z.string().min(1),
  type: z.enum(['trigger', 'action', 'condition']),
  description: z.string().max(500).optional()
})

const permissionsSchema = z.object({
  network: z.array(z.string().min(1)).min(1).optional(),
  secrets: z.array(z.string().min(1)).min(1).max(20).optional(),
  ai: z.boolean().optional(),
  filesystem: z.array(z.string().min(1)).min(1).optional()
})

const capabilitiesSchema = z.object({
  dataSources: z.array(dataSourceSchema).optional(),
  actions: z.array(actionSchema).optional(),
  aiPipelines: z.array(aiPipelineSchema).optional(),
  views: z.array(viewSchema).optional(),
  flowNodes: z.array(flowNodeSchema).optional()
})

export const pluginManifestSchema = z.object({
  id: z.string().regex(pluginIdRegex, 'Plugin ID must be lowercase alphanumeric with hyphens, 3-64 chars'),
  name: z.string().min(1).max(100),
  version: z.string().regex(semverRegex, 'Version must be valid semver'),
  description: z.string().min(1).max(500),
  author: authorSchema,
  icon: z.string().optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),

  permissions: permissionsSchema.optional(),
  capabilities: capabilitiesSchema.optional(),

  minAppVersion: z.string().regex(semverRegex).optional(),
  maxAppVersion: z.string().regex(semverRegex).optional(),

  auth: z.object({
    type: z.enum(['oauth', 'api_key', 'none']).default('api_key'),
    providerId: z.string().optional()
  }).optional()
})

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type PluginAuthor = z.infer<typeof authorSchema>
export type DataSourceCapability = z.infer<typeof dataSourceSchema>
export type ActionCapability = z.infer<typeof actionSchema>
export type ActionParameter = z.infer<typeof actionParameterSchema>
export type AiPipelineCapability = z.infer<typeof aiPipelineSchema>
export type ViewCapability = z.infer<typeof viewSchema>
export type FlowNodeCapability = z.infer<typeof flowNodeSchema>
export type ManifestPermissions = z.infer<typeof permissionsSchema>
export type ManifestCapabilities = z.infer<typeof capabilitiesSchema>
export type PluginAuth = z.infer<typeof pluginManifestSchema>['auth']

export function validateManifest(json: unknown): {
  success: true
  data: PluginManifest
} | {
  success: false
  errors: z.ZodError
} {
  const result = pluginManifestSchema.safeParse(json)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, errors: result.error }
}
