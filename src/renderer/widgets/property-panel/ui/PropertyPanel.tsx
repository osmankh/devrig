import { useMemo } from 'react'
import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useFlowStore } from '@entities/flow/model/flow-store'
import { Button } from '@shared/ui/button'
import { ScrollArea } from '@shared/ui/scroll-area'
import { TriggerConfigForm } from '@features/configure-node/ui/TriggerConfigForm'
import { ActionConfigForm } from '@features/configure-node/ui/ActionConfigForm'
import { ConditionConfigForm } from '@features/configure-node/ui/ConditionConfigForm'

export function PropertyPanel() {
  const selectedNodeIds = useFlowStore((s) => s.selectedNodeIds)
  const nodes = useFlowStore((s) => s.nodes)
  const updateNode = useFlowStore((s) => s.updateNode)

  const selectedNode = useMemo(() => {
    if (selectedNodeIds.length !== 1) return null
    return nodes[selectedNodeIds[0]] ?? null
  }, [selectedNodeIds, nodes])

  const handleConfigChange = (config: string) => {
    if (!selectedNode) return
    updateNode(selectedNode.id, { config })
  }

  const handleLabelChange = (label: string) => {
    if (!selectedNode) return
    updateNode(selectedNode.id, { label })
  }

  return (
    <AnimatePresence>
      {selectedNode && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-full flex-col overflow-hidden border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-3 py-2">
            <span className="text-[var(--text-xs)] font-semibold text-[var(--color-text-primary)]">Properties</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => useFlowStore.getState().setSelectedNodes([])}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Body */}
          <ScrollArea className="flex-1">
            <div className="space-y-4 p-3">
              {/* Node label */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Label</label>
                <input
                  type="text"
                  value={selectedNode.label}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
                />
              </div>

              {/* Type badge */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[var(--color-text-tertiary)]">Type</label>
                <div className="text-[var(--text-xs)] text-[var(--color-text-primary)] capitalize">{selectedNode.type}</div>
              </div>

              {/* Config form based on type */}
              {selectedNode.type === 'trigger' && (
                <TriggerConfigForm config={selectedNode.config} onChange={handleConfigChange} />
              )}
              {selectedNode.type === 'action' && (
                <ActionConfigForm config={selectedNode.config} onChange={handleConfigChange} />
              )}
              {selectedNode.type === 'condition' && (
                <ConditionConfigForm config={selectedNode.config} onChange={handleConfigChange} />
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
