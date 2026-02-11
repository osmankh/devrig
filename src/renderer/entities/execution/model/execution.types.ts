export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

export interface StepState {
  stepId: string
  nodeId: string
  executionId: string
  status: StepStatus
  output?: unknown
  error?: string
  durationMs?: number
}

export interface ExecutionState {
  currentExecutionId: string | null
  status: ExecutionStatus | null
  steps: Record<string, StepState> // keyed by nodeId
  isRunning: boolean
  error: string | null
}
