import { describe, it, expect } from 'vitest'
import { evaluateCondition, validateCondition, type ExecutionContext } from '../../../src/main/services/condition-engine'

function makeContext(overrides?: Partial<ExecutionContext>): ExecutionContext {
  return {
    nodes: {},
    trigger: { type: 'manual' },
    ...overrides
  }
}

function compare(
  left: { type: 'literal'; value: string | number | boolean },
  operator: string,
  right: { type: 'literal'; value: string | number | boolean }
) {
  return { type: 'compare', left, operator, right }
}

function lit(value: string | number | boolean) {
  return { type: 'literal' as const, value }
}

function ctx(path: string) {
  return { type: 'context' as const, path }
}

function nodeRef(nodeId: string, path: string) {
  return { type: 'node' as const, nodeId, path }
}

describe('condition-engine', () => {
  describe('evaluateCondition - equality', () => {
    it('eq: returns true for equal strings', () => {
      const cond = compare(lit('hello'), 'eq', lit('hello'))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('eq: returns false for unequal strings', () => {
      const cond = compare(lit('hello'), 'eq', lit('world'))
      expect(evaluateCondition(cond, makeContext())).toBe(false)
    })

    it('eq: returns true for equal numbers', () => {
      const cond = compare(lit(42), 'eq', lit(42))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('neq: returns true for different values', () => {
      const cond = compare(lit('a'), 'neq', lit('b'))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('neq: returns false for same values', () => {
      const cond = compare(lit(10), 'neq', lit(10))
      expect(evaluateCondition(cond, makeContext())).toBe(false)
    })
  })

  describe('evaluateCondition - comparisons', () => {
    it('gt: 10 > 5 is true', () => {
      const cond = compare(lit(10), 'gt', lit(5))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('gt: 5 > 10 is false', () => {
      const cond = compare(lit(5), 'gt', lit(10))
      expect(evaluateCondition(cond, makeContext())).toBe(false)
    })

    it('gte: 10 >= 10 is true', () => {
      const cond = compare(lit(10), 'gte', lit(10))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('lt: 3 < 7 is true', () => {
      const cond = compare(lit(3), 'lt', lit(7))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('lt: 7 < 3 is false', () => {
      const cond = compare(lit(7), 'lt', lit(3))
      expect(evaluateCondition(cond, makeContext())).toBe(false)
    })

    it('lte: 5 <= 5 is true', () => {
      const cond = compare(lit(5), 'lte', lit(5))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })
  })

  describe('evaluateCondition - type coercion', () => {
    it('compares numeric strings as numbers', () => {
      const cond = compare(lit('10'), 'gt', lit('5'))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('compares string "42" eq number 42', () => {
      const cond = compare(lit('42'), 'eq', lit(42))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })
  })

  describe('evaluateCondition - context references', () => {
    it('resolves context path values', () => {
      const context = makeContext()
      ;(context as any).status = 'active'

      const cond = {
        type: 'compare',
        left: ctx('status'),
        operator: 'eq',
        right: lit('active')
      }
      expect(evaluateCondition(cond, context)).toBe(true)
    })

    it('resolves node output references', () => {
      const context = makeContext({
        nodes: {
          'node-1': { output: { statusCode: 200 } }
        }
      })

      const cond = {
        type: 'compare',
        left: nodeRef('node-1', 'statusCode'),
        operator: 'eq',
        right: lit(200)
      }
      expect(evaluateCondition(cond, context)).toBe(true)
    })

    it('handles missing node gracefully (undefined coerces to empty string)', () => {
      const context = makeContext()

      const cond = {
        type: 'compare',
        left: nodeRef('missing-node', 'value'),
        operator: 'eq',
        right: lit('')
      }
      // undefined → String(undefined ?? '') = '' which equals ''
      expect(evaluateCondition(cond, context)).toBe(true)
    })

    it('handles missing node - not equal to non-empty string', () => {
      const context = makeContext()

      const cond = {
        type: 'compare',
        left: nodeRef('missing-node', 'value'),
        operator: 'eq',
        right: lit('something')
      }
      expect(evaluateCondition(cond, context)).toBe(false)
    })

    it('handles missing path gracefully (undefined coerces to empty string)', () => {
      const context = makeContext({
        nodes: {
          'node-1': { output: { nested: { a: 1 } } }
        }
      })

      const cond = {
        type: 'compare',
        left: nodeRef('node-1', 'nonexistent.deep.path'),
        operator: 'eq',
        right: lit('')
      }
      // undefined path → String(undefined ?? '') = '' equals ''
      expect(evaluateCondition(cond, context)).toBe(true)
    })

    it('missing path is not equal to non-empty value', () => {
      const context = makeContext({
        nodes: {
          'node-1': { output: { nested: { a: 1 } } }
        }
      })

      const cond = {
        type: 'compare',
        left: nodeRef('node-1', 'nonexistent'),
        operator: 'neq',
        right: lit('something')
      }
      expect(evaluateCondition(cond, context)).toBe(true)
    })
  })

  describe('evaluateCondition - boolean values', () => {
    it('compares boolean true', () => {
      const cond = compare(lit(true), 'eq', lit(true))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })

    it('compares boolean false', () => {
      const cond = compare(lit(false), 'eq', lit(false))
      expect(evaluateCondition(cond, makeContext())).toBe(true)
    })
  })

  describe('validateCondition', () => {
    it('returns true for valid condition', () => {
      const cond = compare(lit('a'), 'eq', lit('b'))
      expect(validateCondition(cond)).toBe(true)
    })

    it('returns false for invalid condition (missing type)', () => {
      expect(validateCondition({ left: lit('a'), operator: 'eq', right: lit('b') })).toBe(false)
    })

    it('returns false for invalid operator', () => {
      expect(validateCondition({ type: 'compare', left: lit('a'), operator: 'invalid', right: lit('b') })).toBe(false)
    })

    it('returns false for completely invalid input', () => {
      expect(validateCondition('not an object')).toBe(false)
      expect(validateCondition(null)).toBe(false)
      expect(validateCondition(undefined)).toBe(false)
      expect(validateCondition(42)).toBe(false)
    })
  })
})
