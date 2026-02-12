import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeChange,
  type EdgeChange,
  type Connection,
  type Viewport,
  type NodeTypes,
  type EdgeTypes,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Clipboard, Copy, Trash2, Plus } from 'lucide-react'
import { useFlowStore } from '@entities/flow/model/flow-store'
import {
  toReactFlowNodes,
  toReactFlowEdges,
  applyNodeChanges,
  applyEdgeChanges,
  connectionToEdgeData,
} from '@entities/flow/lib/flow-adapter'
import { createEdge, createNode } from '@entities/flow/api/flow-ipc'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@shared/ui/context-menu'

interface FlowCanvasProps {
  nodeTypes?: NodeTypes
  edgeTypes?: EdgeTypes
}

export function FlowCanvas({ nodeTypes, edgeTypes }: FlowCanvasProps) {
  const nodes = useFlowStore((s) => s.nodes)
  const edges = useFlowStore((s) => s.edges)
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds)
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId)
  const viewport = useFlowStore((s) => s.viewport)
  const updateNode = useFlowStore((s) => s.updateNode)
  const removeNodes = useFlowStore((s) => s.removeNodes)
  const addEdge = useFlowStore((s) => s.addEdge)
  const removeEdges = useFlowStore((s) => s.removeEdges)
  const setSelectedNodes = useFlowStore((s) => s.setSelectedNodes)
  const setViewport = useFlowStore((s) => s.setViewport)
  const storeAddNode = useFlowStore((s) => s.addNode)
  const deleteSelected = useFlowStore((s) => s.deleteSelected)

  const { screenToFlowPosition, fitView } = useReactFlow()

  // Track the right-click position for "Add node here"
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null)

  // Convert store data to React Flow format
  const rfNodes = useMemo(() => {
    const converted = toReactFlowNodes(nodes)
    // Apply selection state
    return converted.map((n) => ({
      ...n,
      selected: selectedNodeIds.includes(n.id),
    }))
  }, [nodes, selectedNodeIds])

  const rfEdges = useMemo(() => toReactFlowEdges(edges), [edges])

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges(changes, updateNode, removeNodes, setSelectedNodes, selectedNodeIds)
    },
    [updateNode, removeNodes, setSelectedNodes, selectedNodeIds],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      applyEdgeChanges(changes, removeEdges)
    },
    [removeEdges],
  )

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!currentWorkflowId) return
      try {
        const edgeData = connectionToEdgeData(connection, currentWorkflowId)
        const newEdge = await createEdge(edgeData)
        addEdge(newEdge)
      } catch (error) {
        console.error('Failed to create edge:', error)
      }
    },
    [currentWorkflowId, addEdge],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault()
      if (!currentWorkflowId) return

      const nodeType = event.dataTransfer.getData('application/devrig-node-type')
      if (!nodeType) return

      // Get label and config from dataTransfer (set by NodePaletteItem)
      const label = event.dataTransfer.getData('application/devrig-node-label') || 'New Node'
      const config = event.dataTransfer.getData('application/devrig-node-config') || undefined

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      try {
        const newNode = await createNode({
          workflowId: currentWorkflowId,
          type: nodeType,
          label,
          x: position.x,
          y: position.y,
          config,
        })
        storeAddNode(newNode)
      } catch (error) {
        console.error('Failed to create node:', error)
      }
    },
    [currentWorkflowId, screenToFlowPosition, storeAddNode],
  )

  const onMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, vp: Viewport) => {
      setViewport(vp)
    },
    [setViewport],
  )

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      setContextPos(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [screenToFlowPosition],
  )

  const handleAddNode = useCallback(
    async (type: string, label: string) => {
      if (!currentWorkflowId || !contextPos) return
      try {
        const newNode = await createNode({
          workflowId: currentWorkflowId,
          type,
          label,
          x: contextPos.x,
          y: contextPos.y,
        })
        storeAddNode(newNode)
      } catch (error) {
        console.error('Failed to create node:', error)
      }
    },
    [currentWorkflowId, contextPos, storeAddNode],
  )

  const handleSelectAll = useCallback(() => {
    setSelectedNodes(Object.keys(nodes))
  }, [nodes, setSelectedNodes])

  const hasSelection = selectedNodeIds.length > 0

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="h-full w-full" onContextMenu={handleContextMenu}>
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onMoveEnd={onMoveEnd}
            defaultViewport={viewport}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode="Shift"
            className="bg-[var(--color-bg-primary)]"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1}
              className="!bg-[var(--color-bg-primary)]"
            />
            <Controls className="!bg-[var(--color-bg-tertiary)] !border-[var(--color-border-subtle)] !shadow-md [&>button]:!bg-[var(--color-bg-tertiary)] [&>button]:!border-[var(--color-border-subtle)] [&>button]:!text-[var(--color-text-primary)] [&>button:hover]:!bg-[var(--color-bg-hover)]" />
            <MiniMap
              className="!bg-[var(--color-bg-tertiary)] !border-[var(--color-border-subtle)]"
              maskColor="oklch(from var(--color-bg-primary) l c h / 0.7)"
              nodeColor="var(--color-accent-primary)"
            />
          </ReactFlow>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {hasSelection ? (
          <>
            <ContextMenuItem
              onClick={deleteSelected}
              className="text-[var(--color-danger)]"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete Selected ({selectedNodeIds.length})
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuItem onClick={() => handleAddNode('trigger', 'New Trigger')}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Trigger Node
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleAddNode('action', 'New Action')}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Action Node
        </ContextMenuItem>
        <ContextMenuItem onClick={() => handleAddNode('condition', 'New Condition')}>
          <Plus className="mr-2 h-3.5 w-3.5" />
          Add Condition Node
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleSelectAll}>
          <Copy className="mr-2 h-3.5 w-3.5" />
          Select All
        </ContextMenuItem>
        <ContextMenuItem onClick={() => fitView()}>
          <Clipboard className="mr-2 h-3.5 w-3.5" />
          Fit View
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
