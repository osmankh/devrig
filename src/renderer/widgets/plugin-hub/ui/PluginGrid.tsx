import { useMemo } from 'react'
import { motion } from 'motion/react'
import { PluginCard } from './PluginCard'
import type { AvailablePlugin } from '@entities/plugin'

type ConnectionStatus = 'available' | 'installed' | 'connected'

interface PluginGridProps {
  plugins: AvailablePlugin[]
  connectionStatuses: Record<string, ConnectionStatus>
  searchQuery: string
  onInstall: (plugin: AvailablePlugin) => void
  onSetup: (plugin: AvailablePlugin) => void
  installingId: string | null
}

export function PluginGrid({
  plugins,
  connectionStatuses,
  searchQuery,
  onInstall,
  onSetup,
  installingId
}: PluginGridProps) {
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return plugins
    const q = searchQuery.toLowerCase()
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    )
  }, [plugins, searchQuery])

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
          No plugins found
        </p>
        <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
          {searchQuery ? 'Try a different search term' : 'No plugins available'}
        </p>
      </div>
    )
  }

  return (
    <motion.div
      className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.05 } }
      }}
    >
      {filtered.map((plugin) => (
        <PluginCard
          key={plugin.id}
          plugin={plugin}
          connectionStatus={connectionStatuses[plugin.id] ?? 'available'}
          onInstall={onInstall}
          onSetup={onSetup}
          installing={installingId === plugin.id}
        />
      ))}
    </motion.div>
  )
}
