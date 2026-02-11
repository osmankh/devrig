import { execFile } from 'node:child_process'

export interface ShellExecInput {
  command: string
  workingDirectory?: string
  timeout?: number
}

export interface ShellExecOutput {
  stdout: string
  stderr: string
  exitCode: number
}

export async function executeShell(config: ShellExecInput): Promise<{ success: boolean; output: ShellExecOutput }> {
  const timeout = config.timeout ?? 30_000

  // Use /bin/sh -c via execFile to handle pipes/redirects safely
  const shell = process.platform === 'win32' ? 'cmd' : '/bin/sh'
  const shellArgs = process.platform === 'win32' ? ['/c', config.command] : ['-c', config.command]

  return new Promise((resolve) => {
    const child = execFile(
      shell,
      shellArgs,
      {
        cwd: config.workingDirectory,
        timeout,
        maxBuffer: 1024 * 1024, // 1MB
        env: { ...process.env },
      },
      (error, stdout, stderr) => {
        const exitCode = error && 'code' in error ? (error.code as number) ?? 1 : error ? 1 : 0
        const success = exitCode === 0
        resolve({
          success,
          output: {
            stdout: stdout.toString(),
            stderr: stderr.toString(),
            exitCode,
          },
        })
      },
    )

    // Safety: kill on timeout
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM')
      }
    }, timeout + 1000)
  })
}
