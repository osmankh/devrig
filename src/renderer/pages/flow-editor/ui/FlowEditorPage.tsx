import { useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useRouterStore } from '@app/router/router'
import { useFlowStore } from '@entities/flow/model/flow-store'
import { FlowCanvas, FlowToolbar } from '@widgets/flow-canvas'
import { NodePalette } from '@widgets/node-palette'
import { PropertyPanel } from '@widgets/property-panel'
import { ExecutionPanel } from '@widgets/execution-panel'
import { Skeleton } from '@shared/ui/skeleton'
import { nodeTypes } from '@entities/node'
import { AnimatedEdge } from '@entities/edge'

const edgeTypes = { animated: AnimatedEdge }

export function FlowEditorPage() {
  const route = useRouterStore((s) => s.route)
  const flowId = route.view === 'flow-editor' ? route.flowId : null
  const isLoading = useFlowStore((s) => s.isLoading)
  const loadFlow = useFlowStore((s) => s.loadFlow)

  useEffect(() => {
    if (flowId) {
      loadFlow(flowId)
    }
  }, [flowId, loadFlow])

  if (!flowId) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-tertiary)]">
        No flow selected
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col gap-2 p-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-full w-full" />
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <div className="flex h-full flex-col">
        <FlowToolbar />
        <div className="flex flex-1 overflow-hidden">
          <NodePalette />
          <div className="flex-1 overflow-hidden">
            <FlowCanvas nodeTypes={nodeTypes} edgeTypes={edgeTypes} />
          </div>
          <PropertyPanel />
        </div>
        <ExecutionPanel />
      </div>
    </ReactFlowProvider>
  )
}
