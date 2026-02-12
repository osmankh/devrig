import { z } from 'zod'

// Zod schemas for validation
const valueRefSchema = z.union([
  z.object({ type: z.literal('literal'), value: z.union([z.string(), z.number(), z.boolean()]) }),
  z.object({ type: z.literal('context'), path: z.string() }),
  z.object({ type: z.literal('node'), nodeId: z.string(), path: z.string() }),
])

const compareConditionSchema = z.object({
  type: z.literal('compare'),
  left: valueRefSchema,
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
  right: valueRefSchema,
})

// Recursive schema for compound conditions (AND/OR)
type ConditionInput =
  | z.infer<typeof compareConditionSchema>
  | { type: 'and'; conditions: ConditionInput[] }
  | { type: 'or'; conditions: ConditionInput[] }

const conditionSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([
    compareConditionSchema,
    z.object({
      type: z.literal('and'),
      conditions: z.array(conditionSchema).min(1),
    }),
    z.object({
      type: z.literal('or'),
      conditions: z.array(conditionSchema).min(1),
    }),
  ]),
)

export type ExecutionContext = {
  nodes: Record<string, { output: unknown }>
  trigger: { type: string }
}

/** Safely access nested properties via dot-path (e.g., "status" or "data.items.0.name") */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function resolveValueRef(ref: z.infer<typeof valueRefSchema>, context: ExecutionContext): unknown {
  switch (ref.type) {
    case 'literal':
      return ref.value
    case 'context':
      return getByPath(context, ref.path)
    case 'node':
      return getByPath(context.nodes[ref.nodeId]?.output, ref.path)
  }
}

function compareValues(left: unknown, right: unknown, operator: string): boolean {
  // Coerce to numbers if both look numeric
  const numLeft = Number(left)
  const numRight = Number(right)
  const useNumbers = !isNaN(numLeft) && !isNaN(numRight) && left !== '' && right !== ''

  const l = useNumbers ? numLeft : String(left ?? '')
  const r = useNumbers ? numRight : String(right ?? '')

  switch (operator) {
    case 'eq': return l === r
    case 'neq': return l !== r
    case 'gt': return l > r
    case 'gte': return l >= r
    case 'lt': return l < r
    case 'lte': return l <= r
    default: return false
  }
}

function evaluateRecursive(parsed: ConditionInput, context: ExecutionContext): boolean {
  switch (parsed.type) {
    case 'compare': {
      const left = resolveValueRef(parsed.left, context)
      const right = resolveValueRef(parsed.right, context)
      return compareValues(left, right, parsed.operator)
    }
    case 'and':
      return parsed.conditions.every((c) => evaluateRecursive(c, context))
    case 'or':
      return parsed.conditions.some((c) => evaluateRecursive(c, context))
  }
}

export function evaluateCondition(expression: unknown, context: ExecutionContext): boolean {
  const parsed = conditionSchema.parse(expression)
  return evaluateRecursive(parsed, context)
}

export function validateCondition(expression: unknown): boolean {
  try {
    conditionSchema.parse(expression)
    return true
  } catch {
    return false
  }
}
