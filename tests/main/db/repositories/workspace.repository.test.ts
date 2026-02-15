import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../../../helpers/test-db'
import { WorkspaceRepository } from '../../../../src/main/db/repositories/workspace.repository'

describe('WorkspaceRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: WorkspaceRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new WorkspaceRepository(db)
  })
  afterEach(() => { db.close() })

  describe('list', () => {
    it('returns empty array when no workspaces exist', () => {
      expect(repo.list()).toEqual([])
    })

    it('returns workspaces ordered by created_at ASC', () => {
      const ws1 = repo.create({ name: 'First' })
      const ws2 = repo.create({ name: 'Second' })
      const list = repo.list()
      expect(list).toHaveLength(2)
      expect(list[0].id).toBe(ws1.id)
      expect(list[1].id).toBe(ws2.id)
    })
  })

  describe('get', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.get('non-existent')).toBeUndefined()
    })

    it('returns workspace by id', () => {
      const created = repo.create({ name: 'Test WS' })
      const fetched = repo.get(created.id)
      expect(fetched).toBeDefined()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.name).toBe('Test WS')
    })
  })

  describe('create', () => {
    it('creates a workspace with default settings', () => {
      const ws = repo.create({ name: 'My Workspace' })
      expect(ws.id).toBeTruthy()
      expect(ws.name).toBe('My Workspace')
      expect(ws.settings).toBe('{}')
      expect(ws.createdAt).toBeGreaterThan(0)
      expect(ws.updatedAt).toBe(ws.createdAt)
    })

    it('creates a workspace with custom settings', () => {
      const ws = repo.create({ name: 'Custom', settings: '{"theme":"dark"}' })
      expect(ws.settings).toBe('{"theme":"dark"}')
    })

    it('persists to the database', () => {
      const ws = repo.create({ name: 'Persistent' })
      const fetched = repo.get(ws.id)
      expect(fetched).toBeDefined()
      expect(fetched!.name).toBe('Persistent')
    })
  })

  describe('update', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.update('non-existent', { name: 'X' })).toBeUndefined()
    })

    it('updates name only', () => {
      const ws = repo.create({ name: 'Old Name' })
      const updated = repo.update(ws.id, { name: 'New Name' })
      expect(updated).toBeDefined()
      expect(updated!.name).toBe('New Name')
      expect(updated!.settings).toBe('{}')
    })

    it('updates settings only', () => {
      const ws = repo.create({ name: 'WS', settings: '{"a":1}' })
      const updated = repo.update(ws.id, { settings: '{"a":2}' })
      expect(updated!.name).toBe('WS')
      expect(updated!.settings).toBe('{"a":2}')
    })

    it('updates updatedAt timestamp', () => {
      const ws = repo.create({ name: 'WS' })
      const updated = repo.update(ws.id, { name: 'WS2' })
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(ws.updatedAt)
    })

    it('persists changes to the database', () => {
      const ws = repo.create({ name: 'Before' })
      repo.update(ws.id, { name: 'After' })
      const fetched = repo.get(ws.id)
      expect(fetched!.name).toBe('After')
    })
  })

  describe('getDefault', () => {
    it('creates a default workspace when none exist', () => {
      const ws = repo.getDefault()
      expect(ws.name).toBe('Default')
      expect(repo.list()).toHaveLength(1)
    })

    it('returns first workspace when workspaces exist', () => {
      const ws1 = repo.create({ name: 'First' })
      repo.create({ name: 'Second' })
      const def = repo.getDefault()
      expect(def.id).toBe(ws1.id)
    })

    it('only creates one default even when called multiple times', () => {
      repo.getDefault()
      repo.getDefault()
      expect(repo.list()).toHaveLength(1)
    })
  })
})
