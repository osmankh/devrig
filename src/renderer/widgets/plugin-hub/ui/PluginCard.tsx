import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, Download, ExternalLink, Loader2, Database, Zap, Brain } from 'lucide-react'
import { Badge, Button } from '@shared/ui'
import type { AvailablePlugin } from '@entities/plugin'

type ConnectionStatus = 'available' | 'installed' | 'connected'

interface PluginCardProps {
  plugin: AvailablePlugin
  connectionStatus: ConnectionStatus
  onInstall: (plugin: AvailablePlugin) => void
  onSetup: (plugin: AvailablePlugin) => void
  installing?: boolean
}

const PLUGIN_ICONS: Record<string, string> = {
  gmail: 'https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_32dp.png',
  github: '',
  linear: '',
}

const PLUGIN_COLORS: Record<string, string> = {
  gmail: 'bg-red-500/10 text-red-400',
  github: 'bg-neutral-500/10 text-neutral-300',
  linear: 'bg-violet-500/10 text-violet-400',
}

const PLUGIN_EMOJI: Record<string, string> = {
  gmail: '\u2709\ufe0f',
  github: '\ud83d\udc19',
  linear: '\ud83d\udcca',
}

function PluginIcon({ plugin }: { plugin: AvailablePlugin }) {
  const emoji = PLUGIN_EMOJI[plugin.id]
  const colorClass = PLUGIN_COLORS[plugin.id] ?? 'bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'

  return (
    <div className={`flex h-12 w-12 items-center justify-center rounded-xl text-xl ${colorClass}`}>
      {emoji ?? plugin.name.charAt(0).toUpperCase()}
    </div>
  )
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  switch (status) {
    case 'connected':
      return (
        <Badge className="gap-1 border-0 bg-[var(--color-success)]/15 text-[var(--color-success)] text-[10px]">
          <Check className="h-2.5 w-2.5" />
          Connected
        </Badge>
      )
    case 'installed':
      return (
        <Badge className="border-0 bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] text-[10px]">
          Installed
        </Badge>
      )
    case 'available':
      return (
        <Badge variant="outline" className="text-[10px] text-[var(--color-text-tertiary)]">
          Available
        </Badge>
      )
  }
}

export function PluginCard({ plugin, connectionStatus, onInstall, onSetup, installing }: PluginCardProps) {
  const capCount = plugin.capabilities.dataSources.length +
    plugin.capabilities.actions.length +
    plugin.capabilities.aiPipelines.length

  const handleAction = () => {
    if (connectionStatus === 'available') {
      onInstall(plugin)
    } else if (connectionStatus === 'installed') {
      onSetup(plugin)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group relative flex flex-col rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-primary)] p-4 transition-shadow hover:border-[var(--color-border-default)] hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <PluginIcon plugin={plugin} />
        <StatusBadge status={connectionStatus} />
      </div>

      <div className="mt-3 flex-1">
        <h3 className="text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
          {plugin.name}
        </h3>
        <p className="mt-1 line-clamp-2 text-[var(--text-xs)] leading-relaxed text-[var(--color-text-tertiary)]">
          {plugin.description}
        </p>
      </div>

      {/* Capability indicators */}
      <div className="mt-3 flex items-center gap-3 text-[var(--text-xs)] text-[var(--color-text-quaternary)]">
        {plugin.capabilities.dataSources.length > 0 && (
          <span className="flex items-center gap-1" title="Data sources">
            <Database className="h-3 w-3" />
            {plugin.capabilities.dataSources.length}
          </span>
        )}
        {plugin.capabilities.actions.length > 0 && (
          <span className="flex items-center gap-1" title="Actions">
            <Zap className="h-3 w-3" />
            {plugin.capabilities.actions.length}
          </span>
        )}
        {plugin.capabilities.aiPipelines.length > 0 && (
          <span className="flex items-center gap-1" title="AI pipelines">
            <Brain className="h-3 w-3" />
            {plugin.capabilities.aiPipelines.length}
          </span>
        )}
      </div>

      {/* Action button */}
      <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
        {connectionStatus === 'available' && (
          <Button
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={handleAction}
            disabled={installing}
          >
            {installing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5" />
                Install
              </>
            )}
          </Button>
        )}
        {connectionStatus === 'installed' && (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs"
            onClick={handleAction}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Set up connection
          </Button>
        )}
        {connectionStatus === 'connected' && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full gap-1.5 text-xs text-[var(--color-success)]"
            disabled
          >
            <Check className="h-3.5 w-3.5" />
            Connected
          </Button>
        )}
      </div>
    </motion.div>
  )
}
