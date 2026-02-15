import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../../../helpers/test-db'
import { SettingsRepository } from '../../../../src/main/db/repositories/settings.repository'

describe('SettingsRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: SettingsRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new SettingsRepository(db)
  })
  afterEach(() => { db.close() })

  describe('get', () => {
    it('returns undefined for non-existent key', () => {
      expect(repo.get('non-existent')).toBeUndefined()
    })

    it('returns the value for an existing key', () => {
      repo.set('theme', 'dark')
      expect(repo.get('theme')).toBe('dark')
    })
  })

  describe('set', () => {
    it('creates a new setting', () => {
      repo.set('language', 'en')
      expect(repo.get('language')).toBe('en')
    })

    it('upserts an existing setting', () => {
      repo.set('theme', 'light')
      repo.set('theme', 'dark')
      expect(repo.get('theme')).toBe('dark')
    })

    it('stores JSON values', () => {
      const json = JSON.stringify({ fontSize: 14, fontFamily: 'monospace' })
      repo.set('editor', json)
      expect(repo.get('editor')).toBe(json)
    })
  })

  describe('getAll', () => {
    it('returns empty array when no settings exist', () => {
      expect(repo.getAll()).toEqual([])
    })

    it('returns all settings ordered by key ASC', () => {
      repo.set('zebra', 'z')
      repo.set('alpha', 'a')
      repo.set('middle', 'm')
      const all = repo.getAll()
      expect(all).toHaveLength(3)
      expect(all[0].key).toBe('alpha')
      expect(all[1].key).toBe('middle')
      expect(all[2].key).toBe('zebra')
    })

    it('returns Setting objects with key, value, updated_at', () => {
      repo.set('test', 'val')
      const all = repo.getAll()
      expect(all[0]).toHaveProperty('key', 'test')
      expect(all[0]).toHaveProperty('value', 'val')
      // SELECT * returns snake_case columns from SQLite
      expect(all[0]).toHaveProperty('updated_at')
      expect((all[0] as any).updated_at).toBeGreaterThan(0)
    })
  })

  describe('delete', () => {
    it('returns false for non-existent key', () => {
      expect(repo.delete('non-existent')).toBe(false)
    })

    it('deletes a setting and returns true', () => {
      repo.set('temp', 'value')
      expect(repo.delete('temp')).toBe(true)
      expect(repo.get('temp')).toBeUndefined()
    })

    it('does not affect other settings', () => {
      repo.set('keep', 'yes')
      repo.set('remove', 'no')
      repo.delete('remove')
      expect(repo.get('keep')).toBe('yes')
      expect(repo.getAll()).toHaveLength(1)
    })
  })
})
