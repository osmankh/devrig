import type { BrowserWindow } from 'electron'
import type { Database } from 'better-sqlite3'
import type { WorkflowRepository } from '../db/repositories/workflow.repository'
import type { ExecutionRepository } from '../db/repositories/execution.repository'
import { executeWorkflow } from './flow-executor'

interface TriggerSchedulerDeps {
  workflow: WorkflowRepository
  execution: ExecutionRepository
}

interface ScheduleConfig {
  intervalValue: number
  intervalUnit: 'minutes' | 'hours' | 'days'
}

interface TriggerConfig {
  triggerType: string
  schedule?: ScheduleConfig
}

interface ScheduledJob {
  workflowId: string
  intervalMs: number
  timerId: ReturnType<typeof setInterval>
}

const UNIT_TO_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

/**
 * TriggerScheduler manages interval-based automatic workflow execution.
 * It scans all workflows for schedule-type triggers and creates
 * setInterval timers that fire executeWorkflow on each tick.
 */
export class TriggerScheduler {
  private jobs = new Map<string, ScheduledJob>()
  private refreshTimerId: ReturnType<typeof setInterval> | null = null
  private repos: TriggerSchedulerDeps
  private db: Database
  private getMainWindow: () => BrowserWindow | null

  constructor(
    db: Database,
    repos: TriggerSchedulerDeps,
    getMainWindow: () => BrowserWindow | null,
  ) {
    this.db = db
    this.repos = repos
    this.getMainWindow = getMainWindow
  }

  /** Start the scheduler — loads all scheduled workflows. Call once at startup. */
  start(): void {
    this.refreshJobs()
    // Periodically re-scan for schedule changes (every 60s)
    this.refreshTimerId = setInterval(() => this.refreshJobs(), 60_000)
  }

  /** Stop all scheduled triggers. Call at app shutdown. */
  stop(): void {
    if (this.refreshTimerId) {
      clearInterval(this.refreshTimerId)
      this.refreshTimerId = null
    }
    for (const job of this.jobs.values()) {
      clearInterval(job.timerId)
    }
    this.jobs.clear()
  }

  /** Reload scheduled jobs from the database (call after workflow edits). */
  refreshJobs(): void {
    // Query all workflows that have a schedule trigger in their nodes
    const rows = this.db
      .prepare(
        `SELECT DISTINCT fn.workflow_id, fn.config
         FROM flow_nodes fn
         JOIN workflows w ON w.id = fn.workflow_id
         WHERE fn.type = 'trigger'
           AND w.status != 'disabled'`,
      )
      .all() as Array<{ workflow_id: string; config: string | null }>

    // Track which workflows still have schedules
    const activeWorkflowIds = new Set<string>()

    for (const row of rows) {
      const config = parseTriggerConfig(row.config)
      if (config?.triggerType !== 'schedule' || !config.schedule) continue

      const workflowId = row.workflow_id
      activeWorkflowIds.add(workflowId)

      const intervalMs = scheduleToMs(config.schedule)
      if (intervalMs <= 0) continue

      const existing = this.jobs.get(workflowId)
      if (existing && existing.intervalMs === intervalMs) {
        // Same interval — keep running
        continue
      }

      // Clear old timer if interval changed
      if (existing) {
        clearInterval(existing.timerId)
      }

      // Create new interval
      const timerId = setInterval(() => {
        this.runWorkflow(workflowId)
      }, intervalMs)

      this.jobs.set(workflowId, { workflowId, intervalMs, timerId })
    }

    // Remove jobs for workflows that no longer have schedule triggers
    for (const [workflowId, job] of this.jobs.entries()) {
      if (!activeWorkflowIds.has(workflowId)) {
        clearInterval(job.timerId)
        this.jobs.delete(workflowId)
      }
    }
  }

  /** Execute a scheduled workflow. */
  private async runWorkflow(workflowId: string): Promise<void> {
    try {
      await executeWorkflow(
        workflowId,
        'schedule',
        this.repos,
        this.getMainWindow(),
      )
    } catch (error) {
      console.error(
        `[trigger-scheduler] Failed to execute workflow ${workflowId}:`,
        error,
      )
    }
  }
}

function parseTriggerConfig(raw: string | null): TriggerConfig | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as TriggerConfig
  } catch {
    return null
  }
}

function scheduleToMs(schedule: ScheduleConfig): number {
  const multiplier = UNIT_TO_MS[schedule.intervalUnit] ?? 0
  return Math.max(0, schedule.intervalValue * multiplier)
}
