import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../../../helpers/test-db'
import { PluginRepository } from '../../../../src/main/db/repositories/plugin.repository'

describe('PluginRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: PluginRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new PluginRepository(db)
  })
  afterEach(() => { db.close() })

  const manifest = JSON.stringify({ id: 'test', name: 'Test', version: '1.0.0' })

  // ── create ──────────────────────────────────────────────
  describe('create()', () => {
    it('creates a plugin with defaults', () => {
      const plugin = repo.create({ name: 'Gmail', version: '1.0.0', manifest })
      expect(plugin.id).toBeTypeOf('string')
      expect(plugin.name).toBe('Gmail')
      expect(plugin.version).toBe('1.0.0')
      expect(plugin.manifest).toBe(manifest)
      expect(plugin.enabled).toBe(1)
      expect(plugin.installedAt).toBeTypeOf('number')
      expect(plugin.updatedAt).toBeTypeOf('number')
    })

    it('creates a disabled plugin', () => {
      const plugin = repo.create({ name: 'Disabled', version: '0.1.0', manifest, enabled: false })
      expect(plugin.enabled).toBe(0)
    })
  })

  // ── get ─────────────────────────────────────────────────
  describe('get()', () => {
    it('retrieves a plugin by id', () => {
      const created = repo.create({ name: 'GitHub', version: '2.0.0', manifest })
      const found = repo.get(created.id)
      expect(found).toBeDefined()
      expect(found!.name).toBe('GitHub')
    })

    it('returns undefined for unknown id', () => {
      expect(repo.get('nonexistent')).toBeUndefined()
    })
  })

  // ── getByName ───────────────────────────────────────────
  describe('getByName()', () => {
    it('retrieves a plugin by name', () => {
      repo.create({ name: 'Linear', version: '1.0.0', manifest })
      const found = repo.getByName('Linear')
      expect(found).toBeDefined()
      expect(found!.name).toBe('Linear')
    })

    it('returns undefined for unknown name', () => {
      expect(repo.getByName('NoSuchPlugin')).toBeUndefined()
    })
  })

  // ── list ────────────────────────────────────────────────
  describe('list()', () => {
    it('lists all plugins sorted by name', () => {
      repo.create({ name: 'Zebra', version: '1.0.0', manifest })
      repo.create({ name: 'Alpha', version: '1.0.0', manifest })
      const all = repo.list()
      expect(all).toHaveLength(2)
      expect(all[0].name).toBe('Alpha')
      expect(all[1].name).toBe('Zebra')
    })

    it('returns empty when no plugins', () => {
      expect(repo.list()).toHaveLength(0)
    })
  })

  // ── listEnabled ─────────────────────────────────────────
  describe('listEnabled()', () => {
    it('only returns enabled plugins', () => {
      repo.create({ name: 'Enabled1', version: '1.0.0', manifest })
      repo.create({ name: 'Disabled1', version: '1.0.0', manifest, enabled: false })
      repo.create({ name: 'Enabled2', version: '1.0.0', manifest })
      const enabled = repo.listEnabled()
      expect(enabled).toHaveLength(2)
      expect(enabled.every((p) => p.enabled === 1)).toBe(true)
    })
  })

  // ── update ──────────────────────────────────────────────
  describe('update()', () => {
    it('updates version and manifest', () => {
      const plugin = repo.create({ name: 'Test', version: '1.0.0', manifest })
      const newManifest = JSON.stringify({ id: 'test', name: 'Test', version: '2.0.0' })
      const updated = repo.update(plugin.id, { version: '2.0.0', manifest: newManifest })
      expect(updated).toBeDefined()
      expect(updated!.version).toBe('2.0.0')
      expect(updated!.manifest).toBe(newManifest)
    })

    it('toggles enabled flag', () => {
      const plugin = repo.create({ name: 'Toggle', version: '1.0.0', manifest })
      expect(plugin.enabled).toBe(1)
      const disabled = repo.update(plugin.id, { enabled: false })
      expect(disabled!.enabled).toBe(0)
      const enabled = repo.update(plugin.id, { enabled: true })
      expect(enabled!.enabled).toBe(1)
    })

    it('returns undefined for unknown id', () => {
      expect(repo.update('nonexistent', { version: '9.9.9' })).toBeUndefined()
    })

    it('preserves fields not included in update', () => {
      const plugin = repo.create({ name: 'Keep', version: '1.0.0', manifest })
      const updated = repo.update(plugin.id, { version: '1.1.0' })
      expect(updated!.manifest).toBe(manifest)
      expect(updated!.name).toBe('Keep')
    })
  })

  // ── delete ──────────────────────────────────────────────
  describe('delete()', () => {
    it('deletes an existing plugin', () => {
      const plugin = repo.create({ name: 'ToDelete', version: '1.0.0', manifest })
      expect(repo.delete(plugin.id)).toBe(true)
      expect(repo.get(plugin.id)).toBeUndefined()
    })

    it('returns false for unknown id', () => {
      expect(repo.delete('nonexistent')).toBe(false)
    })
  })
})
