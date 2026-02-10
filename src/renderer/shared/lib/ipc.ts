interface IpcResult<T> {
  data?: T
  error?: string
  code?: string
}

function getApi() {
  if (typeof window !== 'undefined' && window.devrig) {
    return window.devrig
  }
  // Fallback for tests or non-Electron environments
  return {
    invoke: () => Promise.resolve(null),
    on: () => {},
    off: () => {}
  }
}

export async function ipcInvoke<T>(
  channel: string,
  ...args: unknown[]
): Promise<T> {
  const api = getApi()
  const result = (await api.invoke(channel, ...args)) as IpcResult<T>
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    throw new Error(result.error)
  }
  if (result && typeof result === 'object' && 'data' in result) {
    return result.data as T
  }
  return result as T
}

export function ipcOn(channel: string, callback: (...args: unknown[]) => void): void {
  getApi().on(channel, callback)
}

export function ipcOff(channel: string, callback: (...args: unknown[]) => void): void {
  getApi().off(channel, callback)
}
