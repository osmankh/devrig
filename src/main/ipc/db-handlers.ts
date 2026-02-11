import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type {
  WorkspaceRepository,
  WorkflowRepository,
  NodeRepository,
  EdgeRepository,
  ExecutionRepository,
  SettingsRepository
} from '../db/repositories'

interface Repos {
  workspace: WorkspaceRepository
  workflow: WorkflowRepository
  node: NodeRepository
  edge: EdgeRepository
  execution: ExecutionRepository
  settings: SettingsRepository
}

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

export function registerDbHandlers(repos: Repos): void {
  // Workspace handlers
  secureHandle('db:workspace:list', () => {
    return ok(repos.workspace.list())
  })

  secureHandle('db:workspace:get', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid workspace id', 'VALIDATION')
    const result = repos.workspace.get(parsed.data)
    if (!result) return err('Workspace not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:workspace:create', (_e, data: unknown) => {
    const parsed = z.object({ name: z.string().min(1) }).safeParse(data)
    if (!parsed.success) return err('Invalid workspace data', 'VALIDATION')
    return ok(repos.workspace.create(parsed.data))
  })

  secureHandle('db:workspace:update', (_e, id: unknown, data: unknown) => {
    const idParsed = z.string().safeParse(id)
    const dataParsed = z
      .object({ name: z.string().min(1).optional(), settings: z.string().optional() })
      .safeParse(data)
    if (!idParsed.success || !dataParsed.success)
      return err('Invalid data', 'VALIDATION')
    const result = repos.workspace.update(idParsed.data, dataParsed.data)
    if (!result) return err('Workspace not found', 'NOT_FOUND')
    return ok(result)
  })

  // Workflow handlers
  secureHandle('db:workflow:list', (_e, workspaceId: unknown, limit?: unknown, offset?: unknown) => {
    const parsed = z.string().safeParse(workspaceId)
    if (!parsed.success) return err('Invalid workspace id', 'VALIDATION')
    const l = typeof limit === 'number' ? limit : 50
    const o = typeof offset === 'number' ? offset : 0
    return ok(repos.workflow.list(parsed.data, l, o))
  })

  secureHandle('db:workflow:get', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')
    const result = repos.workflow.get(parsed.data)
    if (!result) return err('Workflow not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:workflow:getWithNodes', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')
    const result = repos.workflow.getWithNodes(parsed.data)
    if (!result) return err('Workflow not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:workflow:create', (_e, data: unknown) => {
    const parsed = z
      .object({
        workspaceId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.string().optional(),
        triggerConfig: z.string().optional()
      })
      .safeParse(data)
    if (!parsed.success) return err('Invalid workflow data', 'VALIDATION')
    return ok(repos.workflow.create(parsed.data))
  })

  secureHandle('db:workflow:update', (_e, id: unknown, data: unknown) => {
    const idParsed = z.string().safeParse(id)
    const dataParsed = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.string().optional(),
        triggerConfig: z.string().optional()
      })
      .safeParse(data)
    if (!idParsed.success || !dataParsed.success)
      return err('Invalid data', 'VALIDATION')
    const result = repos.workflow.update(idParsed.data, dataParsed.data)
    if (!result) return err('Workflow not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:workflow:delete', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')
    return ok(repos.workflow.delete(parsed.data))
  })

  // Node handlers
  secureHandle('db:node:create', (_e, data: unknown) => {
    const parsed = z
      .object({
        workflowId: z.string(),
        type: z.string(),
        label: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        config: z.string().optional()
      })
      .safeParse(data)
    if (!parsed.success) return err('Invalid node data', 'VALIDATION')
    return ok(repos.node.create(parsed.data))
  })

  secureHandle('db:node:update', (_e, id: unknown, data: unknown) => {
    const idParsed = z.string().safeParse(id)
    const dataParsed = z
      .object({
        type: z.string().optional(),
        label: z.string().optional(),
        x: z.number().optional(),
        y: z.number().optional(),
        config: z.string().optional()
      })
      .safeParse(data)
    if (!idParsed.success || !dataParsed.success)
      return err('Invalid data', 'VALIDATION')
    const result = repos.node.update(idParsed.data, dataParsed.data)
    if (!result) return err('Node not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:node:delete', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid node id', 'VALIDATION')
    return ok(repos.node.delete(parsed.data))
  })

  secureHandle('db:node:batchCreate', (_e, nodes: unknown) => {
    const parsed = z
      .array(
        z.object({
          workflowId: z.string(),
          type: z.string(),
          label: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          config: z.string().optional()
        })
      )
      .safeParse(nodes)
    if (!parsed.success) return err('Invalid nodes data', 'VALIDATION')
    return ok(repos.node.batchCreate(parsed.data))
  })

  secureHandle('db:node:batchUpdate', (_e, updates: unknown) => {
    const parsed = z
      .array(
        z.object({
          id: z.string(),
          type: z.string().optional(),
          label: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          config: z.string().optional()
        })
      )
      .safeParse(updates)
    if (!parsed.success) return err('Invalid updates data', 'VALIDATION')
    return ok(repos.node.batchUpdate(parsed.data))
  })

  // Edge handlers
  secureHandle('db:edge:create', (_e, data: unknown) => {
    const parsed = z
      .object({
        workflowId: z.string(),
        sourceNodeId: z.string(),
        targetNodeId: z.string(),
        sourceHandle: z.string().optional(),
        targetHandle: z.string().optional(),
        label: z.string().optional()
      })
      .safeParse(data)
    if (!parsed.success) return err('Invalid edge data', 'VALIDATION')
    return ok(repos.edge.create(parsed.data))
  })

  secureHandle('db:edge:delete', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid edge id', 'VALIDATION')
    return ok(repos.edge.delete(parsed.data))
  })

  secureHandle('db:edge:deleteByWorkflow', (_e, workflowId: unknown) => {
    const parsed = z.string().safeParse(workflowId)
    if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')
    return ok(repos.edge.deleteByWorkflow(parsed.data))
  })

  secureHandle('db:edge:batchCreate', (_e, edges: unknown) => {
    const parsed = z
      .array(
        z.object({
          workflowId: z.string(),
          sourceNodeId: z.string(),
          targetNodeId: z.string(),
          sourceHandle: z.string().optional(),
          targetHandle: z.string().optional(),
          label: z.string().optional()
        })
      )
      .safeParse(edges)
    if (!parsed.success) return err('Invalid edges data', 'VALIDATION')
    return ok(repos.edge.batchCreate(parsed.data))
  })

  // Execution handlers
  secureHandle('db:execution:list', (_e, workflowId: unknown, limit?: unknown, offset?: unknown) => {
    const parsed = z.string().safeParse(workflowId)
    if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')
    const l = typeof limit === 'number' ? limit : 50
    const o = typeof offset === 'number' ? offset : 0
    return ok(repos.execution.list(parsed.data, l, o))
  })

  secureHandle('db:execution:create', (_e, data: unknown) => {
    const parsed = z
      .object({
        workflowId: z.string(),
        triggerType: z.string(),
        status: z.string().optional()
      })
      .safeParse(data)
    if (!parsed.success) return err('Invalid execution data', 'VALIDATION')
    return ok(repos.execution.create(parsed.data))
  })

  secureHandle('db:execution:update', (_e, id: unknown, data: unknown) => {
    const idParsed = z.string().safeParse(id)
    const dataParsed = z
      .object({
        status: z.string().optional(),
        startedAt: z.number().optional(),
        completedAt: z.number().optional(),
        error: z.string().optional()
      })
      .safeParse(data)
    if (!idParsed.success || !dataParsed.success)
      return err('Invalid data', 'VALIDATION')
    const result = repos.execution.update(idParsed.data, dataParsed.data)
    if (!result) return err('Execution not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:execution:get', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid execution id', 'VALIDATION')
    const result = repos.execution.get(parsed.data)
    if (!result) return err('Execution not found', 'NOT_FOUND')
    return ok(result)
  })

  secureHandle('db:execution:getWithSteps', (_e, id: unknown) => {
    const parsed = z.string().safeParse(id)
    if (!parsed.success) return err('Invalid execution id', 'VALIDATION')
    const result = repos.execution.getWithSteps(parsed.data)
    if (!result) return err('Execution not found', 'NOT_FOUND')
    return ok(result)
  })

  // Settings handlers
  secureHandle('db:settings:get', (_e, key: unknown) => {
    const parsed = z.string().safeParse(key)
    if (!parsed.success) return err('Invalid key', 'VALIDATION')
    return ok(repos.settings.get(parsed.data) ?? null)
  })

  secureHandle('db:settings:set', (_e, key: unknown, value: unknown) => {
    const keyParsed = z.string().safeParse(key)
    const valueParsed = z.string().safeParse(value)
    if (!keyParsed.success || !valueParsed.success)
      return err('Invalid data', 'VALIDATION')
    repos.settings.set(keyParsed.data, valueParsed.data)
    return ok(true)
  })
}
