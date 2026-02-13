import { useState, useEffect, useRef } from 'react'
import { Check, Copy, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { Button } from '@shared/ui'
import { oauthPoll } from '../lib/oauth-ipc'

interface DeviceCodeDisplayProps {
  userCode: string
  verificationUri: string
  pluginId: string
  onComplete: () => void
  onError: (error: string) => void
}

export function DeviceCodeDisplay({
  userCode,
  verificationUri,
  pluginId,
  onComplete,
  onError,
}: DeviceCodeDisplayProps) {
  const [status, setStatus] = useState<'polling' | 'complete' | 'expired' | 'denied'>('polling')
  const [copied, setCopied] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const result = await oauthPoll(pluginId)
        if (result.status === 'complete') {
          setStatus('complete')
          onComplete()
          if (intervalRef.current) clearInterval(intervalRef.current)
        } else if (result.status === 'expired') {
          setStatus('expired')
          onError('Code expired. Please try again.')
          if (intervalRef.current) clearInterval(intervalRef.current)
        } else if (result.status === 'denied') {
          setStatus('denied')
          onError('Authorization denied.')
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      } catch {
        // Polling error — keep trying
      }
    }, 5000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [pluginId, onComplete, onError])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(userCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'complete') {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-success)]/15">
          <Check className="h-5 w-5 text-[var(--color-success)]" />
        </div>
        <p className="text-[var(--text-sm)] font-medium text-[var(--color-success)]">
          Authorization complete
        </p>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <XCircle className="h-8 w-8 text-[var(--color-danger)]" />
        <p className="text-[var(--text-sm)] font-medium text-[var(--color-danger)]">
          Code expired
        </p>
        <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
          Close and try again to get a new code.
        </p>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <XCircle className="h-8 w-8 text-[var(--color-danger)]" />
        <p className="text-[var(--text-sm)] font-medium text-[var(--color-danger)]">
          Authorization denied
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="text-center">
        <p className="mb-2 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
          Enter this code on GitHub:
        </p>
        <div className="flex items-center gap-2">
          <code className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-2 font-mono text-lg font-bold tracking-widest text-[var(--color-text-primary)]">
            {userCode}
          </code>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
            {copied ? (
              <Check className="h-3.5 w-3.5 text-[var(--color-success)]" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => window.open(verificationUri, '_blank')}
        className="gap-1.5"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Open GitHub
      </Button>

      <div className="flex items-center gap-2 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Waiting for authorization...
      </div>
    </div>
  )
}
