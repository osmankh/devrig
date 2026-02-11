import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '@shared/ui/button'
import { useFlowStore } from '@entities/flow/model/flow-store'
import { exportFlow, validateImport } from '../lib/flow-serializer'
import { createFlow, batchCreateNodes, batchCreateEdges } from '@entities/flow/api/flow-ipc'
import { useWorkspaceStore } from '@entities/workspace/model/workspace-store'
import { useRouterStore } from '@app/router/router'

export function ImportExportButtons() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleExport = () => {
    const state = useFlowStore.getState()
    const flow = state.flows.find((f) => f.id === state.currentWorkflowId)
    if (!flow) return

    const json = exportFlow(flow, state.nodes, state.edges)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${flow.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.devrig.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const data = validateImport(text)
    if (!data) {
      console.error('Invalid flow file')
      return
    }

    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    if (!workspaceId) return

    try {
      // Create flow
      const flow = await createFlow({
        workspaceId,
        name: data.flow.name + ' (imported)',
        description: data.flow.description ?? undefined,
      })

      // Create nodes
      const nodes = await batchCreateNodes(
        data.nodes.map((n) => ({
          workflowId: flow.id,
          type: n.type,
          label: n.label,
          x: n.x,
          y: n.y,
          config: n.config ?? undefined,
        })),
      )

      // Create edges (mapping indices to new node IDs)
      if (data.edges.length > 0) {
        await batchCreateEdges(
          data.edges.map((e) => ({
            workflowId: flow.id,
            sourceNodeId: nodes[e.sourceIndex]?.id ?? '',
            targetNodeId: nodes[e.targetIndex]?.id ?? '',
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            label: e.label ?? undefined,
          })),
        )
      }

      // Navigate to new flow
      useRouterStore.getState().navigate({ view: 'flow-editor', flowId: flow.id })
    } catch (error) {
      console.error('Failed to import flow:', error)
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export flow">
        <Download className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => fileInputRef.current?.click()}
        title="Import flow"
      >
        <Upload className="h-3.5 w-3.5" />
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleImport}
      />
    </>
  )
}
