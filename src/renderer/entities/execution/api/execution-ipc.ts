import { ipcInvoke, ipcOn, ipcOff } from '@shared/lib/ipc'

// Types
export interface ValidationError {
  nodeId?: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface Execution {
  id: string
  workflowId: string
  status: string
  triggerType: string
  startedAt: number | null
  completedAt: number | null
  error: string | null
  createdAt: number
}

export interface ExecutionStep {
  id: string
  executionId: string
  nodeId: string
  status: string
  input: string | null
  output: string | null
  error: string | null
  startedAt: number | null
  completedAt: number | null
  durationMs: number | null
}

export interface ExecutionWithSteps extends Execution {
  steps: ExecutionStep[]
}

export async function listExecutions(workflowId: string, limit = 50, offset = 0): Promise<Execution[]> {
  const result = await ipcInvoke<{ data?: Execution[]; error?: string }>('db:execution:list', workflowId, limit, offset)
  if (result.error) throw new Error(result.error)
  return result.data!
}

export async function getExecution(id: string): Promise<Execution> {
  const result = await ipcInvoke<{ data?: Execution; error?: string }>('db:execution:get', id)
  if (result.error) throw new Error(result.error)
  return result.data!
}

export async function getExecutionWithSteps(id: string): Promise<ExecutionWithSteps> {
  const result = await ipcInvoke<{ data?: ExecutionWithSteps; error?: string }>('db:execution:getWithSteps', id)
  if (result.error) throw new Error(result.error)
  return result.data!
}

export async function validateWorkflow(workflowId: string): Promise<ValidationResult> {
  return ipcInvoke<ValidationResult>('execution:validate', { workflowId })
}

export async function runWorkflow(workflowId: string): Promise<{ executionId: string }> {
  const result = await ipcInvoke<{ data?: { executionId: string }; error?: string }>('execution:run', { workflowId })
  if (result.error) throw new Error(result.error)
  return result.data!
}

export async function cancelExecution(executionId: string): Promise<void> {
  const result = await ipcInvoke<{ data?: boolean; error?: string }>('execution:cancel', { executionId })
  if (result.error) throw new Error(result.error)
}

export function onStepUpdate(callback: (step: ExecutionStep) => void): () => void {
  const handler = (...args: unknown[]) => callback(args[1] as ExecutionStep)
  ipcOn('execution:step-update', handler)
  return () => ipcOff('execution:step-update', handler)
}

export function onExecutionComplete(callback: (execution: Execution) => void): () => void {
  const handler = (...args: unknown[]) => callback(args[1] as Execution)
  ipcOn('execution:complete', handler)
  return () => ipcOff('execution:complete', handler)
}
