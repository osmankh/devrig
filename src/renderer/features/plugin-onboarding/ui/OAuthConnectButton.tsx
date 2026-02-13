import { useState, useEffect, useRef, useCallback } from 'react'
import { Check, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@shared/ui'
import { ipcOn, ipcOff } from '@shared/lib/ipc'
import { oauthSupports, oauthStart } from '../lib/oauth-ipc'
import { DeviceCodeDisplay } from './DeviceCodeDisplay'

interface OAuthConnectButtonProps {
  pluginId: string
  pluginName: string
  onConnected: () => void
}

type OAuthStatus = 'idle' | 'connecting' | 'waiting' | 'device_code' | 'connected' | 'error'

export function OAuthConnectButton({ pluginId, pluginName, onConnected }: OAuthConnectButtonProps) {
  const [status, setStatus] = useState<OAuthStatus>('idle')
  const [deviceInfo, setDeviceInfo] = useState<{ userCode: string; verificationUri: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState<boolean | null>(null)
  const callbackRef = useRef<((...args: unknown[]) => void) | null>(null)

  useEffect(() => {
    oauthSupports(pluginId)
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [pluginId])

  // Clean up ipc listener on unmount
  useEffect(() => {
    return () => {
      if (callbackRef.current) {
        ipcOff('oauth:callback-received', callbackRef.current)
        callbackRef.current = null
      }
    }
  }, [])

  const handleConnect = useCallback(async () => {
    setStatus('connecting')
    setError(null)
    setDeviceInfo(null)

    try {
      const result = await oauthStart(pluginId)

      if (result.type === 'browser_opened') {
        setStatus('waiting')
        const callback = (..._args: unknown[]) => {
          setStatus('connected')
          onConnected()
          if (callbackRef.current) {
            ipcOff('oauth:callback-received', callbackRef.current)
            callbackRef.current = null
          }
        }
        callbackRef.current = callback
        ipcOn('oauth:callback-received', callback)
      } else if (result.type === 'device_code') {
        setStatus('device_code')
        setDeviceInfo({
          userCode: result.userCode!,
          verificationUri: result.verificationUri!,
        })
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to start OAuth')
    }
  }, [pluginId, onConnected])

  if (supported === null) return null
  if (supported === false) return null

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-success)]/15">
          <Check className="h-3 w-3 text-[var(--color-success)]" />
        </div>
        <span className="text-[var(--text-sm)] font-medium text-[var(--color-success)]">
          Connected
        </span>
      </div>
    )
  }

  if (status === 'device_code' && deviceInfo) {
    return (
      <DeviceCodeDisplay
        userCode={deviceInfo.userCode}
        verificationUri={deviceInfo.verificationUri}
        pluginId={pluginId}
        onComplete={() => {
          setStatus('connected')
          onConnected()
        }}
        onError={(msg) => {
          setStatus('error')
          setError(msg)
        }}
      />
    )
  }

  if (status === 'waiting') {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 className="h-4 w-4 animate-spin text-[var(--color-accent-primary)]" />
        <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
          Waiting for browser authorization...
        </span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-[var(--color-danger)]" />
          <span className="text-[var(--text-sm)] text-[var(--color-danger)]">
            {error}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleConnect}>
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      onClick={handleConnect}
      disabled={status === 'connecting'}
      className="gap-1.5"
    >
      {status === 'connecting' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <ExternalLink className="h-3.5 w-3.5" />
          Connect with {pluginName}
        </>
      )}
    </Button>
  )
}
