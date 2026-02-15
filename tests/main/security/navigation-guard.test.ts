import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockApp, mockShell } = vi.hoisted(() => ({
  mockApp: { isPackaged: true },
  mockShell: { openExternal: vi.fn() }
}))

vi.mock('electron', () => ({
  app: mockApp,
  shell: mockShell
}))

import { configureNavigationGuards } from '../../../src/main/navigation-guard'

function makeMockBrowserWindow() {
  const eventHandlers: Record<string, Function> = {}
  let windowOpenHandler: Function | null = null

  return {
    webContents: {
      on: vi.fn((event: string, handler: Function) => {
        eventHandlers[event] = handler
      }),
      setWindowOpenHandler: vi.fn((handler: Function) => {
        windowOpenHandler = handler
      }),
      _trigger: (event: string, ...args: unknown[]) => eventHandlers[event]?.(...args),
      _triggerWindowOpen: (details: { url: string }) => windowOpenHandler?.(details)
    }
  }
}

describe('navigation-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApp.isPackaged = true
  })

  describe('will-navigate', () => {
    it('allows file:// navigation', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'file:///Users/app/index.html')

      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('allows devtools:// navigation', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'devtools://devtools/inspector.html')

      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('blocks https:// navigation in production', () => {
      mockApp.isPackaged = true
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'https://evil.com/phishing')

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks http:// navigation in production', () => {
      mockApp.isPackaged = true
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'http://evil.com/exploit')

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('allows localhost navigation in dev mode', () => {
      mockApp.isPackaged = false
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'http://localhost:5173/index.html')

      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('blocks non-localhost http in dev mode', () => {
      mockApp.isPackaged = false
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'http://external.com/page')

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks javascript: protocol', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'javascript:alert(1)')

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('blocks data: URLs', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-navigate', event, 'data:text/html,<h1>XSS</h1>')

      expect(event.preventDefault).toHaveBeenCalled()
    })
  })

  describe('setWindowOpenHandler', () => {
    it('opens https:// URLs in external browser', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const result = win.webContents._triggerWindowOpen({ url: 'https://github.com/repo' })

      expect(mockShell.openExternal).toHaveBeenCalledWith('https://github.com/repo')
      expect(result).toEqual({ action: 'deny' })
    })

    it('opens http:// URLs in external browser', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const result = win.webContents._triggerWindowOpen({ url: 'http://example.com' })

      expect(mockShell.openExternal).toHaveBeenCalledWith('http://example.com')
      expect(result).toEqual({ action: 'deny' })
    })

    it('denies non-http URLs without opening external browser', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const result = win.webContents._triggerWindowOpen({ url: 'ftp://files.example.com' })

      expect(mockShell.openExternal).not.toHaveBeenCalled()
      expect(result).toEqual({ action: 'deny' })
    })

    it('always returns deny to prevent new Electron windows', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const result = win.webContents._triggerWindowOpen({ url: 'https://example.com' })
      expect(result).toEqual({ action: 'deny' })
    })
  })

  describe('will-attach-webview', () => {
    it('prevents all webview attachments', () => {
      const win = makeMockBrowserWindow()
      configureNavigationGuards(win as any)

      const event = { preventDefault: vi.fn() }
      win.webContents._trigger('will-attach-webview', event)

      expect(event.preventDefault).toHaveBeenCalled()
    })
  })

  it('registers all three event handlers', () => {
    const win = makeMockBrowserWindow()
    configureNavigationGuards(win as any)

    expect(win.webContents.on).toHaveBeenCalledWith('will-navigate', expect.any(Function))
    expect(win.webContents.on).toHaveBeenCalledWith('will-attach-webview', expect.any(Function))
    expect(win.webContents.setWindowOpenHandler).toHaveBeenCalledWith(expect.any(Function))
  })
})
