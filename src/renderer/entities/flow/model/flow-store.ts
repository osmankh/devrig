import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { temporal } from 'zundo'
import type { Flow, FlowNode, FlowEdge } from './flow.types'
import * as api from '../api/flow-ipc'

// Auto-save timer
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

interface FlowState {
  // Data
  flows: Flow[]
  currentWorkflowId: string | null
  nodes: Record<string, FlowNode>
  edges: Record<string, FlowEdge>
  viewport: { x: number; y: number; zoom: number }
  selectedNodeIds: string[]
  isDirty: boolean
  isLoading: boolean

  // Actions
  loadFlows: (workspaceId: string) => Promise<void>
  loadFlow: (id: string) => Promise<void>
  addNode: (node: FlowNode) => void
  updateNode: (id: string, data: Partial<FlowNode>) => void
  removeNodes: (ids: string[]) => void
  addEdge: (edge: FlowEdge) => void
  removeEdges: (ids: string[]) => void
  setSelectedNodes: (ids: string[]) => void
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void
  saveFlow: () => Promise<void>
  createFlow: (workspaceId: string, name: string) => Promise<Flow>
  deleteFlow: (id: string) => Promise<void>
}

export const useFlowStore = create<FlowState>()(
  temporal(
    immer((set, get) => ({
      flows: [],
      currentWorkflowId: null,
      nodes: {},
      edges: {},
      viewport: { x: 0, y: 0, zoom: 1 },
      selectedNodeIds: [],
      isDirty: false,
      isLoading: false,

      loadFlows: async (workspaceId) => {
        const flows = await api.listFlows(workspaceId)
        set((s) => {
          s.flows = flows
        })
      },

      loadFlow: async (id) => {
        // Cancel any pending auto-save for the previous flow
        if (autoSaveTimer) {
          clearTimeout(autoSaveTimer)
          autoSaveTimer = null
        }

        set((s) => {
          s.isLoading = true
        })
        try {
          const result = await api.getFlowWithNodes(id)
          set((s) => {
            s.currentWorkflowId = id
            s.nodes = {}
            s.edges = {}
            for (const node of result.nodes) {
              s.nodes[node.id] = node
            }
            for (const edge of result.edges) {
              s.edges[edge.id] = edge
            }
            s.selectedNodeIds = []
            s.isDirty = false
            s.isLoading = false
          })
        } catch {
          set((s) => {
            s.isLoading = false
          })
        }
      },

      addNode: (node) => {
        set((s) => {
          s.nodes[node.id] = node
          s.isDirty = true
        })
      },

      updateNode: (id, data) => {
        set((s) => {
          const node = s.nodes[id]
          if (node) {
            Object.assign(node, data)
            s.isDirty = true
          }
        })
      },

      removeNodes: (ids) => {
        set((s) => {
          for (const id of ids) {
            delete s.nodes[id]
            // Remove connected edges
            for (const [edgeId, edge] of Object.entries(s.edges)) {
              if (edge.sourceNodeId === id || edge.targetNodeId === id) {
                delete s.edges[edgeId]
              }
            }
          }
          s.selectedNodeIds = s.selectedNodeIds.filter(
            (nid) => !ids.includes(nid)
          )
          s.isDirty = true
        })
      },

      addEdge: (edge) => {
        set((s) => {
          s.edges[edge.id] = edge
          s.isDirty = true
        })
      },

      removeEdges: (ids) => {
        set((s) => {
          for (const id of ids) {
            delete s.edges[id]
          }
          s.isDirty = true
        })
      },

      setSelectedNodes: (ids) => {
        set((s) => {
          s.selectedNodeIds = ids
        })
      },

      setViewport: (viewport) => {
        set((s) => {
          s.viewport = viewport
        })
      },

      saveFlow: async () => {
        const state = get()
        if (!state.currentWorkflowId || !state.isDirty) return

        const nodes = Object.values(state.nodes)
        if (nodes.length > 0) {
          await api.batchUpdateNodes(
            nodes.map((n) => ({
              id: n.id,
              type: n.type,
              label: n.label,
              x: n.x,
              y: n.y,
              config: n.config ?? undefined
            }))
          )
        }

        set((s) => {
          s.isDirty = false
        })
      },

      createFlow: async (workspaceId, name) => {
        const flow = await api.createFlow({ workspaceId, name })
        set((s) => {
          s.flows.push(flow)
        })
        return flow
      },

      deleteFlow: async (id) => {
        await api.deleteFlow(id)
        set((s) => {
          s.flows = s.flows.filter((f) => f.id !== id)
          if (s.currentWorkflowId === id) {
            s.currentWorkflowId = null
            s.nodes = {}
            s.edges = {}
          }
        })
      }
    })),
    {
      limit: 100,
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges
      })
    }
  )
)

// Auto-save subscription
useFlowStore.subscribe((state, prevState) => {
  if (state.isDirty && !prevState.isDirty) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSaveTimer = setTimeout(() => {
      useFlowStore.getState().saveFlow()
    }, 2000)
  }
})
