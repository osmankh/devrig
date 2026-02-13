import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, Button, Input, Label } from '@shared/ui'
import { RefreshCw, Check } from 'lucide-react'
import { toast } from 'sonner'
import { ipcInvoke } from '@shared/lib/ipc'
import { PluginPreferencesPanel } from '@features/plugin-preferences'
import { usePluginStore, type Plugin } from '@entities/plugin'
import { OAuthConnectButton } from './OAuthConnectButton'
import { oauthSupports, oauthStatus } from '../lib/oauth-ipc'

interface PluginSetupWizardProps {
  plugin: Plugin
  open: boolean
  onClose: () => void
}

const STEPS = ['Credentials', 'Preferences', 'First Sync', 'Review']

export function PluginSetupWizard({ plugin, open, onClose }: PluginSetupWizardProps) {
  const [step, setStep] = useState(0)
  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [secretStatus, setSecretStatus] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; classified: number } | null>(null)
  const [oauthAvailable, setOauthAvailable] = useState(false)
  const [oauthConnected, setOauthConnected] = useState(false)
  const triggerSync = usePluginStore((s) => s.triggerSync)

  const secrets = plugin.requiredSecrets ?? []

  // Load secret status and OAuth state
  useEffect(() => {
    if (!open) return
    for (const key of secrets) {
      ipcInvoke<boolean>('plugin:hasSecret', plugin.id, key)
        .then((has) => setSecretStatus((prev) => ({ ...prev, [key]: has })))
        .catch(() => {})
    }
    // Check OAuth support
    if (plugin.authType === 'oauth') {
      oauthSupports(plugin.id)
        .then(setOauthAvailable)
        .catch(() => setOauthAvailable(false))
      oauthStatus(plugin.id)
        .then((s) => setOauthConnected(s.connected))
        .catch(() => setOauthConnected(false))
    }
  }, [open, plugin.id])

  const humanizeSecretKey = (key: string): string => {
    const map: Record<string, string> = {
      gmail_oauth_token: 'Gmail OAuth Token',
      github_token: 'GitHub Personal Access Token',
      linear_api_key: 'Linear API Key',
      apiKey: 'API Key',
    }
    if (map[key]) return map[key]
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const handleSaveSecret = async (secretKey: string) => {
    const value = secretValues[secretKey]
    if (!value?.trim()) return
    setSavingKey(secretKey)
    try {
      await ipcInvoke('plugin:setSecret', plugin.id, secretKey, value.trim())
      setSecretStatus((prev) => ({ ...prev, [secretKey]: true }))
      setSecretValues((prev) => ({ ...prev, [secretKey]: '' }))
      toast.success(`${humanizeSecretKey(secretKey)} saved`)
    } catch {
      toast.error('Failed to save credential')
    } finally {
      setSavingKey(null)
    }
  }

  const allSecretsConfigured =
    oauthConnected ||
    plugin.authType === 'none' ||
    secrets.length === 0 ||
    secrets.every((k) => secretStatus[k])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await triggerSync(plugin.id)
      // Wait a moment for sync to complete, then check counts
      await new Promise((r) => setTimeout(r, 2000))
      setSyncResult({ synced: 0, classified: 0 }) // Updated by events
      setStep(3)
    } catch {
      toast.error('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleClose = () => {
    setStep(0)
    setSecretValues({})
    setSyncResult(null)
    onClose()
  }

  const renderCredentialsStep = () => {
    // OAuth flow
    if (plugin.authType === 'oauth' && oauthAvailable) {
      return (
        <div className="space-y-3">
          <OAuthConnectButton
            pluginId={plugin.id}
            pluginName={plugin.name}
            onConnected={() => setOauthConnected(true)}
          />
        </div>
      )
    }

    // OAuth declared but not available — fall through to manual
    if (plugin.authType === 'oauth' && !oauthAvailable) {
      return (
        <div className="space-y-3">
          <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
            OAuth not configured. Enter credentials manually:
          </p>
          {renderManualSecrets()}
        </div>
      )
    }

    // No credentials needed
    if (plugin.authType === 'none') {
      return (
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          No credentials required. Click Next to continue.
        </p>
      )
    }

    // Default: api_key or undefined — manual input
    if (secrets.length === 0) {
      return (
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          This plugin doesn't require any credentials. Click Next to continue.
        </p>
      )
    }

    return renderManualSecrets()
  }

  const renderManualSecrets = () => (
    <>
      {secrets.map((secretKey) => {
        const isConfigured = secretStatus[secretKey] ?? false
        const isSaving = savingKey === secretKey
        return (
          <div key={secretKey}>
            <div className="flex items-center gap-2 mb-1">
              <Label className="text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                {humanizeSecretKey(secretKey)}
              </Label>
              {isConfigured && (
                <Check className="h-3 w-3 text-[var(--color-success)]" />
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={isConfigured ? 'Replace existing...' : `Enter ${humanizeSecretKey(secretKey).toLowerCase()}...`}
                value={secretValues[secretKey] ?? ''}
                onChange={(e) =>
                  setSecretValues((prev) => ({ ...prev, [secretKey]: e.target.value }))
                }
                className="h-8 flex-1 text-[var(--text-xs)]"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!secretValues[secretKey]?.trim() || isSaving}
                onClick={() => handleSaveSecret(secretKey)}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        )
      })}
    </>
  )

  return (
    <Dialog open={open} onOpenChange={() => handleClose()}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="px-6 pt-6 pb-2">
          <DialogTitle className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
            Set up {plugin.name}
          </DialogTitle>
          <DialogDescription className="mt-1 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
            {STEPS[step]} — Step {step + 1} of {STEPS.length}
          </DialogDescription>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-6 bg-[var(--color-accent-primary)]'
                  : i < step
                    ? 'w-1.5 bg-[var(--color-accent-primary)]/50'
                    : 'w-1.5 bg-[var(--color-border-subtle)]'
              }`}
            />
          ))}
        </div>

        <div className="px-6 pb-4 min-h-[200px]">
          {/* Step 0: Credentials */}
          {step === 0 && (
            <div className="space-y-3">
              {renderCredentialsStep()}
            </div>
          )}

          {/* Step 1: Preferences */}
          {step === 1 && (
            <PluginPreferencesPanel pluginId={plugin.id} />
          )}

          {/* Step 2: First Sync */}
          {step === 2 && (
            <div className="flex flex-col items-center justify-center py-8">
              {syncing ? (
                <>
                  <RefreshCw className="h-8 w-8 animate-spin text-[var(--color-accent-primary)] mb-3" />
                  <p className="text-[var(--text-sm)] text-[var(--color-text-primary)]">
                    Syncing {plugin.name}...
                  </p>
                  <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                    This may take a moment
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[var(--text-sm)] text-[var(--color-text-primary)] mb-3">
                    Ready to fetch data from {plugin.name}
                  </p>
                  <Button onClick={handleSync}>
                    Start Sync
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="h-12 w-12 rounded-full bg-[var(--color-success)]/15 flex items-center justify-center mb-3">
                <Check className="h-6 w-6 text-[var(--color-success)]" />
              </div>
              <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                {plugin.name} is ready!
              </p>
              <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                Your data will appear in the unified inbox.
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between border-t border-[var(--color-border-subtle)] px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="text-[var(--color-text-tertiary)]"
          >
            {step === 3 ? 'Close' : 'Skip'}
          </Button>
          <div className="flex gap-2">
            {step > 0 && step < 3 && (
              <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                Back
              </Button>
            )}
            {step < 2 && (
              <Button
                size="sm"
                disabled={step === 0 && !allSecretsConfigured}
                onClick={() => setStep(step + 1)}
              >
                Next
              </Button>
            )}
            {step === 3 && (
              <Button size="sm" onClick={handleClose}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
