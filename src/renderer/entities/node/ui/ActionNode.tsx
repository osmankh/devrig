import { memo, useMemo } from 'react'
import { type NodeProps } from '@xyflow/react'
import { Terminal, Globe, FileText } from 'lucide-react'
import { BaseNode, type BaseNodeData } from './BaseNode'

const actionIcons: Record<string, React.ReactNode> = {
  'shell.exec': <Terminal className="h-4 w-4 text-[var(--color-node-action)]" />,
  'http.request': <Globe className="h-4 w-4 text-[var(--color-node-action)]" />,
  'file.read': <FileText className="h-4 w-4 text-[var(--color-node-action)]" />,
}

export const ActionNode = memo(function ActionNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData

  const config = useMemo(() => {
    if (!nodeData.config) return null
    try {
      return JSON.parse(nodeData.config) as Record<string, unknown>
    } catch {
      return null
    }
  }, [nodeData.config])

  const actionType = (config?.actionType as string) ?? 'shell.exec'
  const icon = actionIcons[actionType] ?? <Terminal className="h-4 w-4 text-[var(--color-node-action)]" />

  const summary = useMemo(() => {
    const actionConfig = config?.config as Record<string, unknown> | undefined
    if (!actionConfig) return null
    switch (actionType) {
      case 'shell.exec':
        return actionConfig.command ? String(actionConfig.command).slice(0, 40) : null
      case 'http.request':
        return actionConfig.url ? `${actionConfig.method ?? 'GET'} ${String(actionConfig.url).slice(0, 30)}` : null
      case 'file.read':
        return actionConfig.path ? String(actionConfig.path).slice(0, 40) : null
      default:
        return null
    }
  }, [config, actionType])

  return (
    <BaseNode
      id={id}
      selected={!!selected}
      label={nodeData.label ?? 'Action'}
      icon={icon}
      accentColor="border-l-[var(--color-node-action)]"
      showTargetHandle={true}
      showSourceHandle={true}
    >
      {summary && <span className="block truncate font-[var(--font-mono)]">{summary}</span>}
    </BaseNode>
  )
})
