import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ArrowLeft, Check, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@shared/ui'
import { toast } from 'sonner'
import { OAuthConnectButton } from '@features/plugin-onboarding/ui/OAuthConnectButton'
import { usePluginStore } from '@entities/plugin'
import type { AvailablePlugin } from '@entities/plugin'

const PLUGIN_EMOJI: Record<string, string> = {
  gmail: '\u2709\ufe0f',
  github: '\ud83d\udc19',
  linear: '\ud83d\udcca',
}

interface PluginSetupFlowProps {
  plugin: AvailablePlugin
  onBack: () => void
  onComplete: () => void
}

const STEPS = ['Connect', 'Sync', 'Done']

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-1.5 py-3">
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width: i === current ? 24 : 6,
            backgroundColor:
              i === current
                ? 'var(--color-accent-primary)'
                : i < current
                  ? 'color-mix(in oklch, var(--color-accent-primary) 50%, transparent)'
                  : 'var(--color-border-subtle)'
          }}
          style={{ height: 6 }}
          transition={{ duration: 0.3 }}
        />
      ))}
    </div>
  )
}

export function PluginSetupFlow({ plugin, onBack, onComplete }: PluginSetupFlowProps) {
  const [step, setStep] = useState(0)
  const [oauthConnected, setOauthConnected] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const triggerSync = usePluginStore((s) => s.triggerSync)

  const emoji = PLUGIN_EMOJI[plugin.id] ?? plugin.name.charAt(0).toUpperCase()

  const handleOAuthConnected = useCallback(() => {
    setOauthConnected(true)
    // Auto-advance to sync step after a brief delay
    setTimeout(() => setStep(1), 800)
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      await triggerSync(plugin.id)
      // Give sync a moment to start, then advance
      await new Promise((r) => setTimeout(r, 2000))
      setSyncDone(true)
      setStep(2)
    } catch {
      toast.error('Sync failed — you can retry from Settings > Connections')
      setSyncDone(true)
      setStep(2)
    } finally {
      setSyncing(false)
    }
  }, [plugin.id, triggerSync])

  const needsAuth = plugin.authType === 'oauth' || plugin.authType === 'api_key'

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] px-6 py-4">
        <button
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{emoji}</span>
          <div>
            <h2 className="text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
              Set up {plugin.name}
            </h2>
            <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
              {STEPS[step]} — Step {step + 1} of {STEPS.length}
            </p>
          </div>
        </div>
      </div>

      <StepDots current={step} total={STEPS.length} />

      {/* Step content */}
      <div className="min-h-[240px] px-6 pb-4">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="connect"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-8"
            >
              {plugin.authType === 'oauth' ? (
                <>
                  <p className="mb-4 text-center text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                    Sign in to {plugin.name} to connect your account. A browser window will open for secure authentication.
                  </p>
                  {oauthConnected ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success)]/15">
                        <Check className="h-6 w-6 text-[var(--color-success)]" />
                      </div>
                      <p className="text-[var(--text-sm)] font-medium text-[var(--color-success)]">
                        Connected!
                      </p>
                    </motion.div>
                  ) : (
                    <OAuthConnectButton
                      pluginId={plugin.id}
                      pluginName={plugin.name}
                      onConnected={handleOAuthConnected}
                    />
                  )}
                </>
              ) : plugin.authType === 'none' || !plugin.authType ? (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success)]/15 mb-3">
                    <Check className="h-6 w-6 text-[var(--color-success)]" />
                  </div>
                  <p className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                    No authentication required
                  </p>
                  <Button size="sm" className="mt-4" onClick={() => setStep(1)}>
                    Continue
                  </Button>
                </>
              ) : (
                <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
                  Configure credentials in Settings &gt; Connections after setup.
                </p>
              )}
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="sync"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-8"
            >
              {syncing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <RefreshCw className="h-10 w-10 text-[var(--color-accent-primary)]" />
                  </motion.div>
                  <p className="mt-4 text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                    Syncing {plugin.name}...
                  </p>
                  <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                    Fetching your latest data
                  </p>
                </>
              ) : (
                <>
                  <p className="mb-4 text-center text-[var(--text-sm)] text-[var(--color-text-secondary)]">
                    Ready to fetch your data from {plugin.name}. This may take a moment.
                  </p>
                  <Button onClick={handleSync} className="gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Start initial sync
                  </Button>
                  <button
                    onClick={() => setStep(2)}
                    className="mt-3 text-[var(--text-xs)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"
                  >
                    Skip for now
                  </button>
                </>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-success)]/15"
              >
                <Check className="h-8 w-8 text-[var(--color-success)]" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-4 text-[var(--text-base)] font-semibold text-[var(--color-text-primary)]"
              >
                {plugin.name} is ready!
              </motion.p>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-1 text-center text-[var(--text-sm)] text-[var(--color-text-tertiary)]"
              >
                Your data will appear in the unified inbox.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <Button size="sm" className="mt-6" onClick={onComplete}>
                  Done
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
