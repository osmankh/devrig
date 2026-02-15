import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../src/main/services/flow-executor', () => ({
  executeWorkflow: vi.fn().mockResolvedValue({ executionId: 'exec-1' }),
}))

import { TriggerScheduler } from '../../../src/main/services/trigger-scheduler'
import { executeWorkflow } from '../../../src/main/services/flow-executor'

const mockedExecuteWorkflow = vi.mocked(executeWorkflow)

function makeMockDb(rows: Array<{ workflow_id: string; config: string | null }> = []) {
  return {
    prepare: vi.fn().mockReturnValue({
      all: vi.fn().mockReturnValue(rows),
    }),
  } as any
}

function makeMockRepos() {
  return {
    workflow: {},
    execution: {},
  } as any
}

describe('TriggerScheduler', () => {
  let scheduler: TriggerScheduler
  let db: ReturnType<typeof makeMockDb>
  let repos: ReturnType<typeof makeMockRepos>
  let getMainWindow: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    db = makeMockDb()
    repos = makeMockRepos()
    getMainWindow = vi.fn().mockReturnValue(null)
    scheduler = new TriggerScheduler(db, repos, getMainWindow)
  })

  afterEach(() => {
    scheduler.stop()
    vi.useRealTimers()
  })

  describe('start', () => {
    it('calls refreshJobs on start', () => {
      db = makeMockDb([])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()
      expect(db.prepare).toHaveBeenCalled()
    })

    it('sets up periodic refresh every 60s', () => {
      scheduler.start()
      const firstCallCount = db.prepare.mock.calls.length

      vi.advanceTimersByTime(60_000)
      expect(db.prepare.mock.calls.length).toBeGreaterThan(firstCallCount)

      vi.advanceTimersByTime(60_000)
      expect(db.prepare.mock.calls.length).toBeGreaterThan(firstCallCount + 1)
    })
  })

  describe('stop', () => {
    it('clears all timers', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 5, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)

      scheduler.start()
      scheduler.stop()

      // After stop, advancing timers should not trigger anything
      vi.advanceTimersByTime(300_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()
    })
  })

  describe('refreshJobs', () => {
    it('creates interval for schedule-type triggers', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 10, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)

      scheduler.start()

      // Advance 10 minutes to trigger the job
      vi.advanceTimersByTime(600_000)
      expect(mockedExecuteWorkflow).toHaveBeenCalledWith('wf-1', 'schedule', repos, null)
    })

    it('ignores non-schedule trigger types', () => {
      const config = JSON.stringify({ triggerType: 'manual' })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)

      scheduler.start()
      vi.advanceTimersByTime(3_600_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()
    })

    it('ignores null config', () => {
      db = makeMockDb([{ workflow_id: 'wf-1', config: null }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)

      scheduler.start()
      vi.advanceTimersByTime(3_600_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()
    })

    it('ignores invalid JSON config', () => {
      db = makeMockDb([{ workflow_id: 'wf-1', config: 'not json' }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)

      scheduler.start()
      vi.advanceTimersByTime(3_600_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()
    })

    it('removes jobs for workflows no longer in database', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 1, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      // Now simulate workflow removal
      db.prepare.mockReturnValue({ all: vi.fn().mockReturnValue([]) })

      // Trigger refresh
      vi.advanceTimersByTime(60_000)

      // Advance past old interval — should not fire
      mockedExecuteWorkflow.mockClear()
      vi.advanceTimersByTime(120_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()
    })

    it('updates interval when schedule config changes', () => {
      const config1 = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 1, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config: config1 }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      // Change to 5 minute interval
      const config2 = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 5, intervalUnit: 'minutes' },
      })
      db.prepare.mockReturnValue({
        all: vi.fn().mockReturnValue([{ workflow_id: 'wf-1', config: config2 }]),
      })

      // Trigger refresh
      vi.advanceTimersByTime(60_000)
      mockedExecuteWorkflow.mockClear()

      // Old interval (1 min) should not fire
      vi.advanceTimersByTime(60_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()

      // New interval (5 min) should fire
      vi.advanceTimersByTime(240_000)
      expect(mockedExecuteWorkflow).toHaveBeenCalled()
    })

    it('keeps existing job if interval unchanged', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 5, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      // Trigger refresh — same config
      vi.advanceTimersByTime(60_000)

      // Should still fire at the 5 minute mark from original start
      mockedExecuteWorkflow.mockClear()
      vi.advanceTimersByTime(240_000)
      expect(mockedExecuteWorkflow).toHaveBeenCalled()
    })
  })

  describe('schedule unit conversion', () => {
    it('converts hours correctly', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 1, intervalUnit: 'hours' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      vi.advanceTimersByTime(3_600_000) // 1 hour
      expect(mockedExecuteWorkflow).toHaveBeenCalledTimes(1)
    })

    it('converts days correctly', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 1, intervalUnit: 'days' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      vi.advanceTimersByTime(86_400_000) // 1 day
      expect(mockedExecuteWorkflow).toHaveBeenCalledTimes(1)
    })

    it('handles zero interval (no job created)', () => {
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 0, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      vi.advanceTimersByTime(3_600_000)
      expect(mockedExecuteWorkflow).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('logs error but does not crash when workflow execution fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const config = JSON.stringify({
        triggerType: 'schedule',
        schedule: { intervalValue: 1, intervalUnit: 'minutes' },
      })
      db = makeMockDb([{ workflow_id: 'wf-1', config }])
      scheduler = new TriggerScheduler(db, repos, getMainWindow)
      scheduler.start()

      mockedExecuteWorkflow.mockRejectedValueOnce(new Error('boom'))

      vi.advanceTimersByTime(60_000)

      // Need to flush promises for the async error handler
      return vi.advanceTimersByTimeAsync(0).then(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[trigger-scheduler]'),
          expect.any(Error),
        )
        consoleSpy.mockRestore()
      })
    })
  })
})
