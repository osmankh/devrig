import type { BrowserWindow } from 'electron'
import { z } from 'zod'
import { secureHandle } from '../ipc-security'
import type { WorkflowRepository } from '../db/repositories/workflow.repository'
import type { ExecutionRepository } from '../db/repositories/execution.repository'
import { executeWorkflow, cancelExecution } from '../services/flow-executor'
import { validateFlow } from '../services/flow-validator'

interface Repos {
  workflow: WorkflowRepository
  execution: ExecutionRepository
}

function ok<T>(data: T) {
  return { data }
}

function err(error: string, code = 'UNKNOWN') {
  return { error, code }
}

export function registerExecutionHandlers(
  repos: Repos,
  getMainWindow: () => BrowserWindow | null,
): void {
  secureHandle('execution:validate', (_event, args: unknown) => {
    try {
      const parsed = z.object({ workflowId: z.string() }).safeParse(args)
      if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')
      const data = repos.workflow.getWithNodes(parsed.data.workflowId)
      if (!data) return err('Workflow not found', 'NOT_FOUND')
      const result = validateFlow(data.nodes, data.edges)
      return ok(result)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Validation failed')
    }
  })

  secureHandle('execution:run', async (_event, args: unknown) => {
    try {
      const parsed = z.object({ workflowId: z.string() }).safeParse(args)
      if (!parsed.success) return err('Invalid workflow id', 'VALIDATION')

      // Validate before executing
      const data = repos.workflow.getWithNodes(parsed.data.workflowId)
      if (!data) return err('Workflow not found', 'NOT_FOUND')
      const validation = validateFlow(data.nodes, data.edges)
      if (!validation.valid) {
        return err(
          validation.errors.map((e) => e.message).join('; '),
          'FLOW_VALIDATION',
        )
      }

      const result = await executeWorkflow(parsed.data.workflowId, 'manual', repos, getMainWindow())
      return ok(result)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Execution failed')
    }
  })

  secureHandle('execution:cancel', (_event, args: unknown) => {
    try {
      const parsed = z.object({ executionId: z.string() }).safeParse(args)
      if (!parsed.success) return err('Invalid execution id', 'VALIDATION')
      const success = cancelExecution(parsed.data.executionId)
      return ok(success)
    } catch (error) {
      return err(error instanceof Error ? error.message : 'Cancel failed')
    }
  })
}
