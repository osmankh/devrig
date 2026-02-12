import { Play, Undo2, Redo2, ZoomIn, ZoomOut, Maximize2, Trash2, Save, Check, Loader2 } from 'lucide-react'
import { useReactFlow } from '@xyflow/react'
import { toast } from 'sonner'
import { Button } from '@shared/ui/button'
import { Separator } from '@shared/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@shared/ui/tooltip'
import { useFlowStore, type SaveStatus } from '@entities/flow/model/flow-store'
import { runWorkflow, validateWorkflow } from '@entities/execution/api/execution-ipc'
import { useExecutionStore } from '@entities/execution/model/execution-store'
import { ImportExportButtons } from '@features/import-export'

function SaveIndicator({ status }: { status: SaveStatus }) {
  switch (status) {
    case 'dirty':
      return (
        <span className="flex items-center gap-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
          Unsaved
        </span>
      )
    case 'saving':
      return (
        <span className="flex items-center gap-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving...
        </span>
      )
    case 'saved':
      return (
        <span className="flex items-center gap-1 text-[var(--text-xs)] text-[var(--color-success)]">
          <Check className="h-3 w-3" />
          Saved
        </span>
      )
    default:
      return null
  }
}

export function FlowToolbar() {
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId)
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds)
  const saveStatus = useFlowStore((s) => s.saveStatus)
  const isDirty = useFlowStore((s) => s.isDirty)
  const deleteSelected = useFlowStore((s) => s.deleteSelected)
  const saveFlow = useFlowStore((s) => s.saveFlow)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const undo = useFlowStore.temporal.getState().undo
  const redo = useFlowStore.temporal.getState().redo
  const { zoomIn, zoomOut, fitView } = useReactFlow()

  const hasSelection = selectedNodeIds.length > 0

  const handleRun = async () => {
    if (!currentWorkflowId || isRunning) return
    try {
      // Validate before running
      const validation = await validateWorkflow(currentWorkflowId)
      if (!validation.valid) {
        for (const error of validation.errors) {
          toast.error('Flow validation failed', { description: error.message })
        }
        return
      }

      const result = await runWorkflow(currentWorkflowId)
      useExecutionStore.getState().startExecution(result.executionId)
    } catch (error) {
      toast.error('Failed to run workflow', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const handleSave = () => {
    if (isDirty) saveFlow()
  }

  return (
    <TooltipProvider delayDuration={300}>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => undo()}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => redo()}>
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomIn()}>
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom In</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomOut()}>
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Zoom Out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => fitView()}>
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fit View</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:text-[var(--color-text-quaternary)]"
              onClick={deleteSelected}
              disabled={!hasSelection}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {hasSelection
              ? `Delete ${selectedNodeIds.length} selected`
              : 'Select nodes to delete'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleSave}
              disabled={!isDirty}
            >
              <Save className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-5" />
        <ImportExportButtons />

        {/* Save status indicator — pushed to the right */}
        <div className="ml-auto">
          <SaveIndicator status={saveStatus} />
        </div>
      </div>
    </TooltipProvider>
  )
}
