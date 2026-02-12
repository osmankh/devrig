import { execFile } from 'node:child_process'

export interface ShellExecInput {
  command: string
  workingDirectory?: string
  timeout?: number
  /** Optional allowlist of permitted command prefixes (e.g., ['git', 'npm', 'node']). If empty, all commands are allowed. */
  allowedCommands?: string[]
}

export interface ShellExecOutput {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Characters/sequences that indicate shell injection attempts.
 * These are blocked when a command is passed to /bin/sh -c.
 */
const DANGEROUS_PATTERNS = [
  /;\s*/,       // command chaining
  /\|\|/,       // OR chaining
  /&&/,         // AND chaining
  /\$\(/,       // command substitution $(...)
  /`/,          // backtick command substitution
  />\s*/,       // output redirection
  /<\s*/,       // input redirection
  /\n/,         // newline injection
  /\r/,         // carriage return injection
]

/**
 * Validates a shell command against an allowlist and dangerous patterns.
 * Security: prevents command injection in flow-executor shell actions.
 */
function validateCommand(command: string, allowedCommands?: string[]): string | null {
  const trimmed = command.trim()

  if (!trimmed) {
    return 'Empty command'
  }

  // Check allowlist if provided
  if (allowedCommands && allowedCommands.length > 0) {
    const baseCommand = trimmed.split(/\s+/)[0]
    const allowed = allowedCommands.some(
      (prefix) => baseCommand === prefix || baseCommand.endsWith(`/${prefix}`)
    )
    if (!allowed) {
      return `Command "${baseCommand}" not in allowlist: [${allowedCommands.join(', ')}]`
    }
  }

  // Block dangerous shell metacharacters/sequences
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return `Command contains blocked shell pattern: ${pattern.source}`
    }
  }

  return null // valid
}

export async function executeShell(config: ShellExecInput): Promise<{ success: boolean; output: ShellExecOutput }> {
  const timeout = config.timeout ?? 30_000

  // Security: validate command before execution
  const validationError = validateCommand(config.command, config.allowedCommands)
  if (validationError) {
    console.warn(`[shell-executor] Blocked command: ${validationError}`)
    return {
      success: false,
      output: {
        stdout: '',
        stderr: `Security: ${validationError}`,
        exitCode: 126,
      },
    }
  }

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
