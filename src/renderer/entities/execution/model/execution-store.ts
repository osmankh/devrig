import { create } from 'zustand'
import type { ExecutionState, StepState, ExecutionStatus } from './execution.types'
import { onStepUpdate, onExecutionComplete } from '../api/execution-ipc'

interface ExecutionActions {
  startExecution: (executionId: string) => void
  handleStepUpdate: (step: StepState) => void
  handleComplete: (data: { id: string; status: string; error?: string }) => void
  reset: () => void
}

const initialState: ExecutionState = {
  currentExecutionId: null,
  status: null,
  steps: {},
  isRunning: false,
  error: null,
}

export const useExecutionStore = create<ExecutionState & ExecutionActions>()((set) => ({
  ...initialState,

  startExecution: (executionId) =>
    set({
      currentExecutionId: executionId,
      status: 'running',
      steps: {},
      isRunning: true,
      error: null,
    }),

  handleStepUpdate: (step) =>
    set((state) => ({
      steps: { ...state.steps, [step.nodeId]: step },
    })),

  handleComplete: (data) =>
    set({
      status: data.status as ExecutionStatus,
      isRunning: false,
      error: data.error ?? null,
    }),

  reset: () => set(initialState),
}))

// Subscribe to IPC events — call once on app init
let unsubscribers: (() => void)[] = []

export function initExecutionSubscriptions(): void {
  // Cleanup previous subscriptions
  unsubscribers.forEach((unsub) => unsub())

  const unsubStep = onStepUpdate((step) => {
    useExecutionStore.getState().handleStepUpdate({
      stepId: step.id ?? (step as any).stepId ?? '',
      nodeId: step.nodeId ?? (step as any).nodeId ?? '',
      executionId: step.executionId ?? (step as any).executionId ?? '',
      status: (step as any).status ?? 'pending',
      output: (step as any).output,
      error: (step as any).error ?? (typeof step.error === 'string' ? step.error : undefined),
      durationMs: (step as any).durationMs,
    })
  })

  const unsubComplete = onExecutionComplete((execution) => {
    useExecutionStore.getState().handleComplete({
      id: (execution as any).id ?? '',
      status: (execution as any).status ?? 'success',
      error: (execution as any).error,
    })
  })

  unsubscribers = [unsubStep, unsubComplete]
}
