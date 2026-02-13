import type { OAuthOrchestrator } from './oauth-orchestrator'

const CHECK_INTERVAL = 5 * 60 * 1000 // 5 minutes
const REFRESH_BUFFER = 10 * 60 * 1000 // 10 minutes before expiry
const KNOWN_PROVIDERS = ['gmail', 'github', 'linear'] as const

export class TokenRefreshService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null

  constructor(private orchestrator: OAuthOrchestrator) {}

  start(): void {
    this.intervalHandle = setInterval(() => this.checkAndRefresh(), CHECK_INTERVAL)
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async checkAndRefresh(): Promise<void> {
    for (const providerId of KNOWN_PROVIDERS) {
      try {
        const status = this.orchestrator.getStatus(providerId)
        if (!status.connected || !status.expiresAt) continue

        const timeUntilExpiry = status.expiresAt - Date.now()
        if (timeUntilExpiry < REFRESH_BUFFER) {
          await this.orchestrator.refreshToken(providerId)
        }
      } catch (err) {
        console.error(`[token-refresh] Failed to refresh ${providerId}:`, err)
      }
    }
  }
}
