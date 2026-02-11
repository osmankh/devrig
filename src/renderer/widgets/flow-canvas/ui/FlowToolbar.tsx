import { Play, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { Button } from '@shared/ui/button'
import { Separator } from '@shared/ui/separator'
import { useFlowStore } from '@entities/flow/model/flow-store'
import { runWorkflow } from '@entities/execution/api/execution-ipc'
import { useExecutionStore } from '@entities/execution/model/execution-store'
import { ImportExportButtons } from '@features/import-export'

export function FlowToolbar() {
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const undo = useFlowStore.temporal.getState().undo
  const redo = useFlowStore.temporal.getState().redo
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  const handleRun = async () => {
    if (!currentWorkflowId || isRunning) return
    try {
      const result = await runWorkflow(currentWorkflowId)
      useExecutionStore.getState().startExecution(result.executionId)
    } catch (error) {
      console.error('Failed to run workflow:', error)
    }
  }

  return (
    <div className="flex h-10 items-center gap-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRun}
        disabled={isRunning}
        className="gap-1.5 text-[var(--text-xs)]"
      >
        <Play className="h-3.5 w-3.5" />
        {isRunning ? 'Running...' : 'Run'}
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => undo()}>
        <Undo2 className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => redo()}>
        <Redo2 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomIn()}>
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomOut()}>
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fitView()}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-5" />
      <ImportExportButtons />
    </div>
  )
}
