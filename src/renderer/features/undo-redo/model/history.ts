import { useFlowStore } from '@entities/flow'

export function undo(): void {
  useFlowStore.temporal.getState().undo()
}

export function redo(): void {
  useFlowStore.temporal.getState().redo()
}

export function canUndo(): boolean {
  return useFlowStore.temporal.getState().pastStates.length > 0
}

export function canRedo(): boolean {
  return useFlowStore.temporal.getState().futureStates.length > 0
}

export function clearHistory(): void {
  useFlowStore.temporal.getState().clear()
}
