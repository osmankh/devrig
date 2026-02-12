// ---------------------------------------------------------------------------
// AI Provider Registry — manages registered providers and default selection
// ---------------------------------------------------------------------------

import type { AIProvider } from './provider-interface'

export class AIProviderRegistry {
  private providers = new Map<string, AIProvider>()
  private defaultProviderId: string | null = null

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider)
    // Auto-set default to the first registered provider
    if (this.defaultProviderId === null) {
      this.defaultProviderId = provider.id
    }
  }

  unregister(id: string): void {
    this.providers.delete(id)
    if (this.defaultProviderId === id) {
      const keys = Array.from(this.providers.keys())
      this.defaultProviderId = keys.length > 0 ? keys[0] : null
    }
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id)
  }

  getDefault(): AIProvider | undefined {
    if (!this.defaultProviderId) return undefined
    return this.providers.get(this.defaultProviderId)
  }

  setDefault(id: string): void {
    if (!this.providers.has(id)) {
      throw new Error(`Provider "${id}" is not registered`)
    }
    this.defaultProviderId = id
  }

  listProviders(): AIProvider[] {
    return Array.from(this.providers.values())
  }
}
