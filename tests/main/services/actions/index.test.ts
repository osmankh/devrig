import { describe, it, expect, vi } from 'vitest'

// Mock individual executors
vi.mock('../../../../src/main/services/actions/shell-executor', () => ({
  executeShell: vi.fn().mockResolvedValue({ success: true, output: { stdout: 'ok', stderr: '', exitCode: 0 } }),
}))

vi.mock('../../../../src/main/services/actions/http-executor', () => ({
  executeHttp: vi.fn().mockResolvedValue({ success: true, output: { status: 200, headers: {}, body: 'ok' } }),
}))

vi.mock('../../../../src/main/services/actions/file-executor', () => ({
  executeFileRead: vi.fn().mockResolvedValue({ success: true, output: { content: 'data', size: 4, encoding: 'utf-8' } }),
}))

vi.mock('../../../../src/main/services/actions/plugin-executor', () => ({
  executePluginAction: vi.fn().mockResolvedValue({ success: true, output: {} }),
}))

import { executeAction, getRegisteredActions } from '../../../../src/main/services/actions'
import { executeShell } from '../../../../src/main/services/actions/shell-executor'
import { executeHttp } from '../../../../src/main/services/actions/http-executor'
import { executeFileRead } from '../../../../src/main/services/actions/file-executor'
import { executePluginAction } from '../../../../src/main/services/actions/plugin-executor'

describe('action dispatch (index)', () => {
  describe('executeAction', () => {
    it('dispatches shell.exec to executeShell', async () => {
      const config = { command: 'echo test', workingDirectory: '/tmp' }
      await executeAction('shell.exec', config)

      expect(executeShell).toHaveBeenCalledWith({
        command: 'echo test',
        workingDirectory: '/tmp',
        timeout: undefined,
      })
    })

    it('dispatches http.request to executeHttp', async () => {
      const config = { method: 'POST', url: 'https://example.com', body: '{}' }
      await executeAction('http.request', config)

      expect(executeHttp).toHaveBeenCalledWith({
        method: 'POST',
        url: 'https://example.com',
        headers: undefined,
        body: '{}',
        timeout: undefined,
      })
    })

    it('dispatches file.read to executeFileRead', async () => {
      const config = { path: '/tmp/test.txt', encoding: 'utf-8' }
      await executeAction('file.read', config)

      expect(executeFileRead).toHaveBeenCalledWith({
        path: '/tmp/test.txt',
        encoding: 'utf-8',
      })
    })

    it('dispatches plugin.action to executePluginAction', async () => {
      const config = { pluginId: 'gmail', actionId: 'send', params: { to: 'user@test.com' } }
      await executeAction('plugin.action', config)

      expect(executePluginAction).toHaveBeenCalledWith(config)
    })

    it('returns error for unknown action type', async () => {
      const result = await executeAction('unknown.type', {})

      expect(result.success).toBe(false)
      expect(result.output).toEqual({ error: 'Unknown action type: unknown.type' })
    })
  })

  describe('getRegisteredActions', () => {
    it('returns all registered action types', () => {
      const actions = getRegisteredActions()
      expect(actions).toContain('shell.exec')
      expect(actions).toContain('http.request')
      expect(actions).toContain('file.read')
      expect(actions).toContain('plugin.action')
      expect(actions).toHaveLength(4)
    })
  })
})
