// ---------------------------------------------------------------------------
// Secrets Bridge — safeStorage wrapper for AI provider API keys
// ---------------------------------------------------------------------------

import { safeStorage } from 'electron'
import type { SecretsRepository } from '../db/repositories/secrets.repository'

/** Well-known secret names for AI provider API keys. */
const AI_KEY_PREFIX = 'ai_provider_key:'

export class SecretsBridge {
  constructor(private secrets: SecretsRepository) {}

  /**
   * Store an API key for an AI provider.
   * Encrypts via Electron safeStorage and persists to SQLite.
   */
  setProviderKey(providerId: string, apiKey: string): void {
    const name = keyName(providerId)
    const encrypted = safeStorage.encryptString(apiKey).toString('base64')

    const existing = this.secrets.getByName(name)
    if (existing) {
      this.secrets.update(name, { encryptedValue: encrypted })
    } else {
      this.secrets.create({ name, encryptedValue: encrypted, provider: 'safeStorage' })
    }
  }

  /**
   * Retrieve and decrypt the API key for a provider.
   * Returns null if not configured or decryption unavailable.
   */
  getProviderKey(providerId: string): string | null {
    if (!safeStorage.isEncryptionAvailable()) return null

    const name = keyName(providerId)
    const secret = this.secrets.getByName(name)
    if (!secret) return null

    try {
      const buffer = Buffer.from(secret.encryptedValue, 'base64')
      return safeStorage.decryptString(buffer)
    } catch {
      return null
    }
  }

  /** Async variant for use as AIProvider getApiKey callback. */
  getProviderKeyAsync(providerId: string): () => Promise<string | null> {
    return async () => this.getProviderKey(providerId)
  }

  /** Check whether a provider has a stored key. */
  hasProviderKey(providerId: string): boolean {
    const name = keyName(providerId)
    return this.secrets.getByName(name) !== undefined
  }

  /** Remove a provider's stored key. */
  removeProviderKey(providerId: string): boolean {
    return this.secrets.delete(keyName(providerId))
  }

  /** List all configured provider IDs that have stored keys. */
  listConfiguredProviders(): string[] {
    const all = this.secrets.list()
    return all
      .filter((s) => s.name.startsWith(AI_KEY_PREFIX))
      .map((s) => s.name.slice(AI_KEY_PREFIX.length))
  }
}

function keyName(providerId: string): string {
  return `${AI_KEY_PREFIX}${providerId}`
}
