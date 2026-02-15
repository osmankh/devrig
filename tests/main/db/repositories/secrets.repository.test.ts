import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb } from '../../../helpers/test-db'
import { SecretsRepository } from '../../../../src/main/db/repositories/secrets.repository'

describe('SecretsRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: SecretsRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new SecretsRepository(db)
  })
  afterEach(() => { db.close() })

  describe('getByName', () => {
    it('returns undefined for non-existent name', () => {
      expect(repo.getByName('non-existent')).toBeUndefined()
    })

    it('returns secret by name', () => {
      repo.create({ name: 'api-key', encryptedValue: 'enc-123' })
      const secret = repo.getByName('api-key') as any
      expect(secret).toBeDefined()
      expect(secret.name).toBe('api-key')
      // SELECT * returns snake_case columns from SQLite
      expect(secret.encrypted_value).toBe('enc-123')
    })
  })

  describe('list', () => {
    it('returns empty array when no secrets exist', () => {
      expect(repo.list()).toEqual([])
    })

    it('returns secrets ordered by name ASC', () => {
      repo.create({ name: 'zebra-key', encryptedValue: 'z' })
      repo.create({ name: 'alpha-key', encryptedValue: 'a' })
      const list = repo.list()
      expect(list).toHaveLength(2)
      expect(list[0].name).toBe('alpha-key')
      expect(list[1].name).toBe('zebra-key')
    })

    it('returns items without encryptedValue field', () => {
      repo.create({ name: 'my-secret', encryptedValue: 'sensitive' })
      const list = repo.list()
      expect(list[0]).toHaveProperty('id')
      expect(list[0]).toHaveProperty('name')
      expect(list[0]).toHaveProperty('provider')
      expect(list[0]).toHaveProperty('createdAt')
      expect(list[0]).toHaveProperty('updatedAt')
      // list() intentionally excludes encryptedValue for security
      expect(list[0]).not.toHaveProperty('encryptedValue')
    })
  })

  describe('create', () => {
    it('creates a secret with default provider', () => {
      const secret = repo.create({ name: 'test-key', encryptedValue: 'enc-abc' })
      expect(secret.id).toBeTruthy()
      expect(secret.name).toBe('test-key')
      expect(secret.encryptedValue).toBe('enc-abc')
      expect(secret.provider).toBe('safeStorage')
      expect(secret.createdAt).toBeGreaterThan(0)
      expect(secret.updatedAt).toBe(secret.createdAt)
    })

    it('creates a secret with custom provider', () => {
      const secret = repo.create({
        name: 'custom-key',
        encryptedValue: 'enc-xyz',
        provider: 'keychain'
      })
      expect(secret.provider).toBe('keychain')
    })

    it('persists to the database', () => {
      const created = repo.create({ name: 'persist-key', encryptedValue: 'enc-99' })
      const fetched = repo.getByName('persist-key')
      expect(fetched).toBeDefined()
      expect(fetched!.id).toBe(created.id)
    })
  })

  describe('update', () => {
    it('returns undefined for non-existent name', () => {
      expect(repo.update('non-existent', { encryptedValue: 'x' })).toBeUndefined()
    })

    it('updates the encrypted value', () => {
      repo.create({ name: 'rotating-key', encryptedValue: 'old-value' })
      const updated = repo.update('rotating-key', { encryptedValue: 'new-value' })
      expect(updated).toBeDefined()
      expect(updated!.encryptedValue).toBe('new-value')
      expect(updated!.name).toBe('rotating-key')
    })

    it('updates updatedAt timestamp', () => {
      const created = repo.create({ name: 'ts-key', encryptedValue: 'v1' })
      const updated = repo.update('ts-key', { encryptedValue: 'v2' })
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
    })

    it('persists changes', () => {
      repo.create({ name: 'persist-update', encryptedValue: 'before' })
      repo.update('persist-update', { encryptedValue: 'after' })
      const fetched = repo.getByName('persist-update') as any
      // SELECT * returns snake_case columns from SQLite
      expect(fetched.encrypted_value).toBe('after')
    })
  })

  describe('delete', () => {
    it('returns false for non-existent name', () => {
      expect(repo.delete('non-existent')).toBe(false)
    })

    it('deletes a secret and returns true', () => {
      repo.create({ name: 'temp-key', encryptedValue: 'enc' })
      expect(repo.delete('temp-key')).toBe(true)
      expect(repo.getByName('temp-key')).toBeUndefined()
    })

    it('does not affect other secrets', () => {
      repo.create({ name: 'keep-key', encryptedValue: 'k' })
      repo.create({ name: 'remove-key', encryptedValue: 'r' })
      repo.delete('remove-key')
      expect(repo.getByName('keep-key')).toBeDefined()
      expect(repo.list()).toHaveLength(1)
    })
  })
})
