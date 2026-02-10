export interface DevRigAPI {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (...args: unknown[]) => void): void
  off(channel: string, callback: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    devrig: DevRigAPI
  }
}
