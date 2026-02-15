import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSession } = vi.hoisted(() => ({
  mockSession: {
    defaultSession: {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn()
    }
  }
}))

vi.mock('electron', () => ({
  session: mockSession
}))

import { configurePermissions } from '../../../src/main/permissions'

describe('permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a permission request handler', () => {
    configurePermissions()
    expect(mockSession.defaultSession.setPermissionRequestHandler).toHaveBeenCalledWith(
      expect.any(Function)
    )
  })

  it('registers a permission check handler', () => {
    configurePermissions()
    expect(mockSession.defaultSession.setPermissionCheckHandler).toHaveBeenCalledWith(
      expect.any(Function)
    )
  })

  describe('permission request handler', () => {
    it('denies all permission requests', () => {
      configurePermissions()

      const handler = mockSession.defaultSession.setPermissionRequestHandler.mock.calls[0][0]
      const callback = vi.fn()

      // Test various permissions
      handler(null, 'geolocation', callback)
      expect(callback).toHaveBeenCalledWith(false)

      callback.mockClear()
      handler(null, 'notifications', callback)
      expect(callback).toHaveBeenCalledWith(false)

      callback.mockClear()
      handler(null, 'media', callback)
      expect(callback).toHaveBeenCalledWith(false)

      callback.mockClear()
      handler(null, 'camera', callback)
      expect(callback).toHaveBeenCalledWith(false)

      callback.mockClear()
      handler(null, 'microphone', callback)
      expect(callback).toHaveBeenCalledWith(false)
    })
  })

  describe('permission check handler', () => {
    it('returns false for all permission checks', () => {
      configurePermissions()

      const handler = mockSession.defaultSession.setPermissionCheckHandler.mock.calls[0][0]

      expect(handler(null, 'geolocation')).toBe(false)
      expect(handler(null, 'notifications')).toBe(false)
      expect(handler(null, 'media')).toBe(false)
    })
  })
})
