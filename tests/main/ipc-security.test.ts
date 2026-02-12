import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockHandle } = vi.hoisted(() => ({
  mockHandle: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: mockHandle }
}))

import { secureHandle } from '../../src/main/ipc-security'

function makeEvent(url: string | undefined) {
  return {
    senderFrame: url ? { url } : null
  } as any
}

// In Node.js, file:// and app:// URLs return 'null' as origin,
// but Electron's Chromium returns 'file://' and 'app://devrig'.
// We patch URL to simulate Electron's behavior for valid origin tests.
const OriginalURL = globalThis.URL

class ElectronLikeURL extends OriginalURL {
  get origin(): string {
    if (this.protocol === 'file:') return 'file://'
    if (this.protocol === 'app:') return `app://${this.hostname}`
    return super.origin
  }
}

describe('ipc-security', () => {
  beforeEach(() => {
    mockHandle.mockReset()
    // Simulate Electron's URL behavior
    globalThis.URL = ElectronLikeURL as typeof URL
  })

  afterEach(() => {
    globalThis.URL = OriginalURL
  })

  describe('validateSender (tested through secureHandle)', () => {
    it('accepts file:// origins', async () => {
      const handler = vi.fn().mockReturnValue('ok')
      secureHandle('test-channel', handler)

      const registeredHandler = mockHandle.mock.calls[0][1]
      const event = makeEvent('file:///Users/dev/app/index.html')
      const result = await registeredHandler(event, 'arg1')

      expect(result).toBe('ok')
      expect(handler).toHaveBeenCalledWith(event, 'arg1')
    })

    it('accepts app://devrig origins', async () => {
      const handler = vi.fn().mockReturnValue('ok')
      secureHandle('test-channel-2', handler)

      const registeredHandler = mockHandle.mock.calls[0][1]
      const event = makeEvent('app://devrig/index.html')
      const result = await registeredHandler(event)

      expect(result).toBe('ok')
    })

    it('rejects http:// origins', async () => {
      const handler = vi.fn()
      secureHandle('test-channel-3', handler)

      const registeredHandler = mockHandle.mock.calls[0][1]
      const event = makeEvent('http://evil.com/page')

      await expect(registeredHandler(event)).rejects.toThrow('Unauthorized IPC sender')
      expect(handler).not.toHaveBeenCalled()
    })

    it('rejects https:// origins', async () => {
      const handler = vi.fn()
      secureHandle('test-channel-4', handler)

      const registeredHandler = mockHandle.mock.calls[0][1]
      const event = makeEvent('https://evil.com/page')

      await expect(registeredHandler(event)).rejects.toThrow('Unauthorized IPC sender')
      expect(handler).not.toHaveBeenCalled()
    })

    it('rejects null senderFrame', async () => {
      const handler = vi.fn()
      secureHandle('test-channel-5', handler)

      const registeredHandler = mockHandle.mock.calls[0][1]
      const event = makeEvent(undefined)

      await expect(registeredHandler(event)).rejects.toThrow('Unauthorized IPC sender')
      expect(handler).not.toHaveBeenCalled()
    })

    it('rejects invalid URL in senderFrame', async () => {
      const handler = vi.fn()
      secureHandle('test-channel-6', handler)

      const registeredHandler = mockHandle.mock.calls[0][1]
      const event = { senderFrame: { url: 'not-a-valid-url' } } as any

      await expect(registeredHandler(event)).rejects.toThrow('Unauthorized IPC sender')
      expect(handler).not.toHaveBeenCalled()
    })

    it('registers handler on ipcMain with correct channel', () => {
      secureHandle('my-channel', vi.fn())
      expect(mockHandle).toHaveBeenCalledWith('my-channel', expect.any(Function))
    })
  })
})
