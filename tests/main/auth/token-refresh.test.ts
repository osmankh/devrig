import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenRefreshService } from '../../../src/main/auth/token-refresh-service'

describe('TokenRefreshService', () => {
  let mockOrchestrator: {
    getStatus: ReturnType<typeof vi.fn>
    refreshToken: ReturnType<typeof vi.fn>
  }
  let service: TokenRefreshService

  beforeEach(() => {
    vi.useFakeTimers()
    mockOrchestrator = {
      getStatus: vi.fn().mockReturnValue({ connected: false }),
      refreshToken: vi.fn().mockResolvedValue(true)
    }
    service = new TokenRefreshService(mockOrchestrator as any)
  })

  afterEach(() => {
    service.stop()
    vi.useRealTimers()
  })

  describe('start / stop', () => {
    it('starts an interval timer', () => {
      service.start()
      // Verify the interval exists by advancing time and checking calls
      expect(mockOrchestrator.getStatus).not.toHaveBeenCalled()
      vi.advanceTimersByTime(5 * 60 * 1000)
      // Should have checked all 3 providers
      expect(mockOrchestrator.getStatus).toHaveBeenCalledTimes(3)
    })

    it('stops the interval timer', () => {
      service.start()
      service.stop()
      vi.advanceTimersByTime(10 * 60 * 1000)
      expect(mockOrchestrator.getStatus).not.toHaveBeenCalled()
    })

    it('stop is safe to call when not started', () => {
      expect(() => service.stop()).not.toThrow()
    })

    it('stop is safe to call multiple times', () => {
      service.start()
      service.stop()
      expect(() => service.stop()).not.toThrow()
    })
  })

  describe('checkAndRefresh', () => {
    it('checks all three providers (gmail, github, linear)', () => {
      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(mockOrchestrator.getStatus).toHaveBeenCalledWith('gmail')
      expect(mockOrchestrator.getStatus).toHaveBeenCalledWith('github')
      expect(mockOrchestrator.getStatus).toHaveBeenCalledWith('linear')
    })

    it('skips disconnected providers', () => {
      mockOrchestrator.getStatus.mockReturnValue({ connected: false })
      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(mockOrchestrator.refreshToken).not.toHaveBeenCalled()
    })

    it('skips connected providers without expiresAt', () => {
      mockOrchestrator.getStatus.mockReturnValue({ connected: true })
      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(mockOrchestrator.refreshToken).not.toHaveBeenCalled()
    })

    it('skips tokens that are not near expiry', () => {
      // Token expires in 30 minutes — well beyond the 10-minute buffer
      mockOrchestrator.getStatus.mockReturnValue({
        connected: true,
        expiresAt: Date.now() + 30 * 60 * 1000
      })
      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(mockOrchestrator.refreshToken).not.toHaveBeenCalled()
    })

    it('refreshes tokens expiring within 10 minutes', () => {
      mockOrchestrator.getStatus.mockImplementation((id: string) => {
        if (id === 'gmail') {
          return { connected: true, expiresAt: Date.now() + 5 * 60 * 1000 } // 5 min left
        }
        return { connected: false }
      })

      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(mockOrchestrator.refreshToken).toHaveBeenCalledWith('gmail')
      expect(mockOrchestrator.refreshToken).toHaveBeenCalledTimes(1)
    })

    it('refreshes already-expired tokens', () => {
      mockOrchestrator.getStatus.mockImplementation((id: string) => {
        if (id === 'github') {
          return { connected: true, expiresAt: Date.now() - 1000 } // already expired
        }
        return { connected: false }
      })

      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      expect(mockOrchestrator.refreshToken).toHaveBeenCalledWith('github')
    })

    it('handles refresh errors gracefully without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockOrchestrator.getStatus.mockReturnValue({
        connected: true,
        expiresAt: Date.now() + 1000 // about to expire
      })
      mockOrchestrator.refreshToken.mockRejectedValue(new Error('Network error'))

      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      // Flush microtasks so the async catch handler runs
      await vi.advanceTimersByTimeAsync(0)

      // Should not throw; error is caught
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })

    it('continues checking other providers even if one throws', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockOrchestrator.getStatus
        .mockImplementationOnce(() => { throw new Error('gmail crashed') })
        .mockReturnValueOnce({ connected: true, expiresAt: Date.now() + 1000 })
        .mockReturnValueOnce({ connected: false })

      service.start()
      vi.advanceTimersByTime(5 * 60 * 1000)

      // github (2nd provider) should still get a refresh attempt
      expect(mockOrchestrator.refreshToken).toHaveBeenCalledWith('github')
      consoleSpy.mockRestore()
    })

    it('runs periodically every 5 minutes', () => {
      mockOrchestrator.getStatus.mockReturnValue({ connected: false })
      service.start()

      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(mockOrchestrator.getStatus).toHaveBeenCalledTimes(3) // 3 providers

      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(mockOrchestrator.getStatus).toHaveBeenCalledTimes(6) // 3 more
    })
  })
})
