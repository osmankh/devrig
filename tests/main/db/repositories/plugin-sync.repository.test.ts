import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedPlugin } from '../../../helpers/test-db'
import { PluginSyncRepository } from '../../../../src/main/db/repositories/plugin-sync.repository'

describe('PluginSyncRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: PluginSyncRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new PluginSyncRepository(db)
    seedPlugin(db, 'plugin-1')
    seedPlugin(db, 'plugin-2')
  })
  afterEach(() => { db.close() })

  // ── create ──────────────────────────────────────────────
  describe('create()', () => {
    it('creates a sync state with defaults', () => {
      const state = repo.create({ pluginId: 'plugin-1', dataSourceId: 'emails' })
      expect(state.pluginId).toBe('plugin-1')
      expect(state.dataSourceId).toBe('emails')
      expect(state.syncStatus).toBe('idle')
      expect(state.itemsSynced).toBe(0)
      expect(state.lastSyncAt).toBeNull()
      expect(state.syncCursor).toBeNull()
      expect(state.error).toBeNull()
      expect(state.createdAt).toBeTypeOf('number')
    })

    it('creates with explicit status', () => {
      const state = repo.create({ pluginId: 'plugin-1', dataSourceId: 'prs', syncStatus: 'syncing' })
      expect(state.syncStatus).toBe('syncing')
    })
  })

  // ── get ─────────────────────────────────────────────────
  describe('get()', () => {
    it('retrieves by composite key', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'emails' })
      const found = repo.get('plugin-1', 'emails')
      expect(found).toBeDefined()
      expect(found!.dataSourceId).toBe('emails')
    })

    it('returns undefined for unknown key', () => {
      expect(repo.get('plugin-1', 'nonexistent')).toBeUndefined()
    })
  })

  // ── getOrCreate ─────────────────────────────────────────
  describe('getOrCreate()', () => {
    it('creates if not exists', () => {
      const state = repo.getOrCreate('plugin-1', 'issues')
      expect(state.pluginId).toBe('plugin-1')
      expect(state.dataSourceId).toBe('issues')
      expect(state.syncStatus).toBe('idle')
    })

    it('returns existing if already created', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'issues' })
      const state = repo.getOrCreate('plugin-1', 'issues')
      expect(state.syncStatus).toBe('idle')
    })
  })

  // ── listByPlugin ────────────────────────────────────────
  describe('listByPlugin()', () => {
    it('returns all data sources for a plugin', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'emails' })
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'labels' })
      repo.create({ pluginId: 'plugin-2', dataSourceId: 'prs' })
      const list = repo.listByPlugin('plugin-1')
      expect(list).toHaveLength(2)
    })
  })

  // ── listByStatus ────────────────────────────────────────
  describe('listByStatus()', () => {
    it('filters by sync status', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'a', syncStatus: 'syncing' })
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'b', syncStatus: 'idle' })
      repo.create({ pluginId: 'plugin-2', dataSourceId: 'c', syncStatus: 'syncing' })
      expect(repo.listByStatus('syncing')).toHaveLength(2)
      expect(repo.listByStatus('idle')).toHaveLength(1)
    })
  })

  // ── listAll / getAll ────────────────────────────────────
  describe('listAll() / getAll()', () => {
    it('returns all sync states', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'a' })
      repo.create({ pluginId: 'plugin-2', dataSourceId: 'b' })
      expect(repo.listAll()).toHaveLength(2)
      expect(repo.getAll()).toHaveLength(2)
    })
  })

  // ── update ──────────────────────────────────────────────
  describe('update()', () => {
    it('updates fields on existing state', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'emails' })
      const updated = repo.update('plugin-1', 'emails', {
        syncStatus: 'syncing',
        syncCursor: 'cursor-abc',
        itemsSynced: 42
      })
      expect(updated).toBeDefined()
      expect(updated!.syncStatus).toBe('syncing')
      expect(updated!.syncCursor).toBe('cursor-abc')
      expect(updated!.itemsSynced).toBe(42)
    })

    it('can set error and lastSyncAt', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      const now = Date.now()
      const updated = repo.update('plugin-1', 'ds', {
        error: 'network timeout',
        lastSyncAt: now
      })
      expect(updated!.error).toBe('network timeout')
      expect(updated!.lastSyncAt).toBe(now)
    })

    it('can clear syncCursor to null', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      repo.update('plugin-1', 'ds', { syncCursor: 'abc' })
      const cleared = repo.update('plugin-1', 'ds', { syncCursor: null })
      expect(cleared!.syncCursor).toBeNull()
    })

    it('returns undefined for unknown key', () => {
      expect(repo.update('plugin-1', 'nope', { syncStatus: 'idle' })).toBeUndefined()
    })
  })

  // ── markSyncing ─────────────────────────────────────────
  describe('markSyncing()', () => {
    it('sets status to syncing and clears error', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      repo.update('plugin-1', 'ds', { error: 'old error' })
      const updated = repo.markSyncing('plugin-1', 'ds')
      expect(updated!.syncStatus).toBe('syncing')
      expect(updated!.error).toBeNull()
    })
  })

  // ── markComplete ────────────────────────────────────────
  describe('markComplete()', () => {
    it('sets status to idle with cursor and count', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      const updated = repo.markComplete('plugin-1', 'ds', 'cursor-99', 150)
      expect(updated!.syncStatus).toBe('idle')
      expect(updated!.syncCursor).toBe('cursor-99')
      expect(updated!.itemsSynced).toBe(150)
      expect(updated!.lastSyncAt).toBeTypeOf('number')
      expect(updated!.error).toBeNull()
    })
  })

  // ── markError ───────────────────────────────────────────
  describe('markError()', () => {
    it('sets status to error with message', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      const updated = repo.markError('plugin-1', 'ds', 'auth expired')
      expect(updated!.syncStatus).toBe('error')
      expect(updated!.error).toBe('auth expired')
    })
  })

  // ── delete ──────────────────────────────────────────────
  describe('delete()', () => {
    it('deletes by composite key', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      expect(repo.delete('plugin-1', 'ds')).toBe(true)
      expect(repo.get('plugin-1', 'ds')).toBeUndefined()
    })

    it('returns false for unknown key', () => {
      expect(repo.delete('plugin-1', 'nope')).toBe(false)
    })
  })

  // ── deleteByPlugin ──────────────────────────────────────
  describe('deleteByPlugin()', () => {
    it('deletes all sync states for a plugin', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'a' })
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'b' })
      repo.create({ pluginId: 'plugin-2', dataSourceId: 'c' })
      const count = repo.deleteByPlugin('plugin-1')
      expect(count).toBe(2)
      expect(repo.listByPlugin('plugin-1')).toHaveLength(0)
      expect(repo.listByPlugin('plugin-2')).toHaveLength(1)
    })
  })

  // ── upsert ──────────────────────────────────────────────
  describe('upsert()', () => {
    it('creates when not exists', () => {
      const state = repo.upsert({
        pluginId: 'plugin-1',
        dataSourceId: 'new-ds',
        syncStatus: 'idle'
      })
      expect(state.pluginId).toBe('plugin-1')
      expect(state.syncStatus).toBe('idle')
    })

    it('updates when already exists', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      const state = repo.upsert({
        pluginId: 'plugin-1',
        dataSourceId: 'ds',
        syncStatus: 'syncing',
        syncCursor: 'new-cursor',
        itemsSynced: 10
      })
      expect(state.syncStatus).toBe('syncing')
      expect(state.syncCursor).toBe('new-cursor')
      expect(state.itemsSynced).toBe(10)
    })
  })

  // ── updateStatus ────────────────────────────────────────
  describe('updateStatus()', () => {
    it('updates status and optional error', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      repo.updateStatus('plugin-1', 'ds', 'error', 'something failed')
      const found = repo.get('plugin-1', 'ds')
      expect(found!.syncStatus).toBe('error')
      expect(found!.error).toBe('something failed')
    })

    it('clears error when not provided', () => {
      repo.create({ pluginId: 'plugin-1', dataSourceId: 'ds' })
      repo.updateStatus('plugin-1', 'ds', 'error', 'err')
      repo.updateStatus('plugin-1', 'ds', 'idle')
      const found = repo.get('plugin-1', 'ds')
      expect(found!.syncStatus).toBe('idle')
      expect(found!.error).toBeNull()
    })
  })
})
