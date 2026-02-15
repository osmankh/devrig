import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

import { executeShell } from '../../../../src/main/services/actions/shell-executor'
import { execFile } from 'node:child_process'

const mockedExecFile = vi.mocked(execFile)

describe('shell-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('command validation', () => {
    it('blocks empty command', async () => {
      const result = await executeShell({ command: '' })
      expect(result.success).toBe(false)
      expect(result.output.stderr).toContain('Security')
      expect(result.output.exitCode).toBe(126)
      expect(mockedExecFile).not.toHaveBeenCalled()
    })

    it('blocks whitespace-only command', async () => {
      const result = await executeShell({ command: '   ' })
      expect(result.success).toBe(false)
      expect(result.output.stderr).toContain('Empty command')
    })

    it('blocks command chaining with semicolons', async () => {
      const result = await executeShell({ command: 'echo hello; rm -rf /' })
      expect(result.success).toBe(false)
      expect(result.output.stderr).toContain('Security')
    })

    it('blocks OR chaining (||)', async () => {
      const result = await executeShell({ command: 'test || evil' })
      expect(result.success).toBe(false)
      expect(result.output.stderr).toContain('blocked shell pattern')
    })

    it('blocks AND chaining (&&)', async () => {
      const result = await executeShell({ command: 'test && evil' })
      expect(result.success).toBe(false)
    })

    it('blocks command substitution $(...)', async () => {
      const result = await executeShell({ command: 'echo $(whoami)' })
      expect(result.success).toBe(false)
    })

    it('blocks backtick command substitution', async () => {
      const result = await executeShell({ command: 'echo `whoami`' })
      expect(result.success).toBe(false)
    })

    it('blocks output redirection', async () => {
      const result = await executeShell({ command: 'echo hack > /etc/passwd' })
      expect(result.success).toBe(false)
    })

    it('blocks input redirection', async () => {
      const result = await executeShell({ command: 'cat < /etc/shadow' })
      expect(result.success).toBe(false)
    })

    it('blocks newline injection', async () => {
      const result = await executeShell({ command: 'echo hi\nrm -rf /' })
      expect(result.success).toBe(false)
    })

    it('blocks carriage return injection', async () => {
      const result = await executeShell({ command: 'echo hi\rrm -rf /' })
      expect(result.success).toBe(false)
    })
  })

  describe('allowlist', () => {
    it('allows commands in the allowlist', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, 'output', '')
        return {} as any
      })

      const result = await executeShell({
        command: 'git status',
        allowedCommands: ['git', 'npm'],
      })
      expect(result.success).toBe(true)
      expect(result.output.stdout).toBe('output')
    })

    it('blocks commands not in the allowlist', async () => {
      const result = await executeShell({
        command: 'rm file.txt',
        allowedCommands: ['git', 'npm'],
      })
      expect(result.success).toBe(false)
      expect(result.output.stderr).toContain('not in allowlist')
    })

    it('allows full path commands matching allowlist suffix', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, '', '')
        return {} as any
      })

      const result = await executeShell({
        command: '/usr/bin/git status',
        allowedCommands: ['git'],
      })
      expect(result.success).toBe(true)
    })

    it('allows all commands when allowlist is empty', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, 'ok', '')
        return {} as any
      })

      const result = await executeShell({
        command: 'some-command arg1 arg2',
        allowedCommands: [],
      })
      expect(result.success).toBe(true)
    })

    it('allows all commands when allowlist is not provided', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, 'ok', '')
        return {} as any
      })

      const result = await executeShell({ command: 'some-command' })
      expect(result.success).toBe(true)
    })
  })

  describe('successful execution', () => {
    it('returns stdout and stderr', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, 'hello world', 'warning: something')
        return {} as any
      })

      const result = await executeShell({ command: 'echo hello world' })

      expect(result.success).toBe(true)
      expect(result.output.stdout).toBe('hello world')
      expect(result.output.stderr).toBe('warning: something')
      expect(result.output.exitCode).toBe(0)
    })

    it('passes working directory to execFile', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, opts: any, callback: any) => {
        callback(null, opts.cwd ?? '', '')
        return {} as any
      })

      await executeShell({ command: 'pwd', workingDirectory: '/tmp' })

      expect(mockedExecFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ cwd: '/tmp' }),
        expect.any(Function),
      )
    })

    it('uses default 30s timeout', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, opts: any, callback: any) => {
        callback(null, '', '')
        return {} as any
      })

      await executeShell({ command: 'echo test' })

      expect(mockedExecFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ timeout: 30_000 }),
        expect.any(Function),
      )
    })

    it('uses custom timeout', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, opts: any, callback: any) => {
        callback(null, '', '')
        return {} as any
      })

      await executeShell({ command: 'echo test', timeout: 5000 })

      expect(mockedExecFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ timeout: 5000 }),
        expect.any(Function),
      )
    })
  })

  describe('failed execution', () => {
    it('returns exit code on failure', async () => {
      const error = Object.assign(new Error('Command failed'), { code: 1 })
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(error, '', 'error output')
        return {} as any
      })

      const result = await executeShell({ command: 'false' })

      expect(result.success).toBe(false)
      expect(result.output.exitCode).toBe(1)
      expect(result.output.stderr).toBe('error output')
    })

    it('defaults to exit code 1 when error has no code', async () => {
      const error = new Error('Something went wrong')
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(error, '', '')
        return {} as any
      })

      const result = await executeShell({ command: 'bad-cmd' })

      expect(result.success).toBe(false)
      expect(result.output.exitCode).toBe(1)
    })
  })

  describe('shell selection', () => {
    it('uses /bin/sh -c on non-windows', async () => {
      mockedExecFile.mockImplementation((_cmd, _args, _opts, callback: any) => {
        callback(null, '', '')
        return {} as any
      })

      await executeShell({ command: 'echo test' })

      const [shell, args] = mockedExecFile.mock.calls[0] as any[]
      // On macOS/Linux
      if (process.platform !== 'win32') {
        expect(shell).toBe('/bin/sh')
        expect(args).toEqual(['-c', 'echo test'])
      }
    })
  })
})
