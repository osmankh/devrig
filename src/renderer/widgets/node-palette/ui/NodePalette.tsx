import { Zap, Clock, Terminal, Globe, FileText, GitBranch, Plug } from 'lucide-react'
import { ScrollArea } from '@shared/ui/scroll-area'
import { NodePaletteItem } from './NodePaletteItem'

const paletteGroups = [
  {
    title: 'Triggers',
    items: [
      {
        type: 'trigger',
        label: 'Manual Trigger',
        description: 'Start workflow manually',
        icon: <Zap className="h-4 w-4 text-amber-500" />,
        defaultConfig: JSON.stringify({ triggerType: 'manual' }),
      },
      {
        type: 'trigger',
        label: 'Scheduled Trigger',
        description: 'Run on a timed interval',
        icon: <Clock className="h-4 w-4 text-amber-500" />,
        defaultConfig: JSON.stringify({ triggerType: 'schedule', schedule: { intervalValue: 15, intervalUnit: 'minutes' } }),
      },
    ],
  },
  {
    title: 'Actions',
    items: [
      {
        type: 'action',
        label: 'Shell Command',
        description: 'Execute a shell command',
        icon: <Terminal className="h-4 w-4 text-blue-500" />,
        defaultConfig: JSON.stringify({ actionType: 'shell.exec', config: { command: '' } }),
      },
      {
        type: 'action',
        label: 'HTTP Request',
        description: 'Make an HTTP request',
        icon: <Globe className="h-4 w-4 text-blue-500" />,
        defaultConfig: JSON.stringify({ actionType: 'http.request', config: { method: 'GET', url: '' } }),
      },
      {
        type: 'action',
        label: 'Read File',
        description: 'Read a file from disk',
        icon: <FileText className="h-4 w-4 text-blue-500" />,
        defaultConfig: JSON.stringify({ actionType: 'file.read', config: { path: '' } }),
      },
      {
        type: 'action',
        label: 'Plugin Action',
        description: 'Run a plugin-provided action',
        icon: <Plug className="h-4 w-4 text-blue-500" />,
        defaultConfig: JSON.stringify({ actionType: 'plugin.action', config: { pluginId: '', actionId: '', params: {} } }),
      },
    ],
  },
  {
    title: 'Logic',
    items: [
      {
        type: 'condition',
        label: 'Condition',
        description: 'Branch based on a condition',
        icon: <GitBranch className="h-4 w-4 text-purple-500" />,
        defaultConfig: JSON.stringify({ condition: { type: 'compare', left: { type: 'literal', value: '' }, operator: 'eq', right: { type: 'literal', value: '' } } }),
      },
    ],
  },
]

export function NodePalette() {
  return (
    <div className="flex h-full w-[220px] flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
      <div className="border-b border-[var(--color-border-subtle)] px-3 py-2">
        <span className="text-[var(--text-xs)] font-semibold text-[var(--color-text-primary)]">Nodes</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {paletteGroups.map((group) => (
            <div key={group.title}>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
                {group.title}
              </div>
              <div className="space-y-1.5">
                {group.items.map((item) => (
                  <NodePaletteItem key={item.label} {...item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
