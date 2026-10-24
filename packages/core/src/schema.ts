/**
 * RPC 参数 schema：零依赖的 Standard Schema 实现，同时提供 JSON Schema 投影。
 *
 * 为什么不用 valibot / devframe 的 simple-schema：devframe 用 schema 做两件事——
 * 运行时校验（`~standard.validate`）与 MCP 工具的 inputSchema（只认
 * `~standard.jsonSchema.input`，缺失就退化成「任意对象」）。valibot 与 simple-schema
 * 都没有原生 JSON Schema 转换器，AI Agent 会看不到参数结构；为此再引入一个
 * 带转换器的校验库又不值当——RPC 参数只是几层扁平对象。
 *
 * 语义刻意宽松：对象保留未声明字段（devframe 也原样把原始参数交给 handler），
 * 只拦类型错误，不做裁剪与转换。
 */

type JsonSchema = Record<string, unknown>

interface Issue {
  message: string
  path?: PropertyKey[]
}

export interface Schema<T = unknown> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: 'uni-devtools'
    readonly validate: (
      value: unknown,
    ) => { value: T; issues?: undefined } | { issues: Issue[] }
    readonly jsonSchema: {
      readonly input: (options?: unknown) => JsonSchema
      readonly output: (options?: unknown) => JsonSchema
    }
    readonly types?: { readonly input: T; readonly output: T }
  }
  /** 内部：返回问题列表（空 = 通过） */
  readonly check: (value: unknown, path: PropertyKey[]) => Issue[]
  readonly json: JsonSchema
  readonly optional: boolean
}

function createSchema<T>(
  json: JsonSchema,
  check: (value: unknown, path: PropertyKey[]) => Issue[],
  optional = false,
): Schema<T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'uni-devtools',
      validate: (value) => {
        const issues = check(value, [])
        return issues.length > 0 ? { issues } : { value: value as T }
      },
      jsonSchema: { input: () => json, output: () => json },
    },
    check,
    json,
    optional,
  }
}

function typeIssue(expected: string, path: PropertyKey[]): Issue[] {
  return [{ message: `expected ${expected}`, path }]
}

function withDescription(json: JsonSchema, description?: string): JsonSchema {
  return description ? { ...json, description } : json
}

export const s = {
  string: (description?: string): Schema<string> =>
    createSchema(withDescription({ type: 'string' }, description), (v, p) =>
      typeof v === 'string' ? [] : typeIssue('string', p),
    ),

  number: (description?: string): Schema<number> =>
    createSchema(withDescription({ type: 'number' }, description), (v, p) =>
      typeof v === 'number' && Number.isFinite(v) ? [] : typeIssue('number', p),
    ),

  boolean: (description?: string): Schema<boolean> =>
    createSchema(withDescription({ type: 'boolean' }, description), (v, p) =>
      typeof v === 'boolean' ? [] : typeIssue('boolean', p),
    ),

  /** 任意 JSON 值（如要写入的新状态值） */
  unknown: (description?: string): Schema<unknown> =>
    createSchema(withDescription({}, description), () => []),

  picklist: <const V extends readonly string[]>(
    values: V,
    description?: string,
  ): Schema<V[number]> =>
    createSchema(
      withDescription({ type: 'string', enum: [...values] }, description),
      (v, p) =>
        typeof v === 'string' && values.includes(v)
          ? []
          : typeIssue(`one of ${values.join(', ')}`, p),
    ),

  array: <T>(item: Schema<T>, description?: string): Schema<T[]> =>
    createSchema(
      withDescription({ type: 'array', items: item.json }, description),
      (v, p) =>
        Array.isArray(v)
          ? v.flatMap((el, i) => item.check(el, [...p, i]))
          : typeIssue('array', p),
    ),

  object: <T extends Record<string, Schema<any>>>(
    shape: T,
    description?: string,
  ): Schema<{ [K in keyof T]: T[K] extends Schema<infer U> ? U : never }> => {
    const required = Object.entries(shape)
      .filter(([, schema]) => !schema.optional)
      .map(([key]) => key)
    const properties = Object.fromEntries(
      Object.entries(shape).map(([key, schema]) => [key, schema.json]),
    )
    return createSchema(
      withDescription(
        {
          type: 'object',
          properties,
          ...(required.length > 0 ? { required } : {}),
        },
        description,
      ),
      (v, p) => {
        if (!v || typeof v !== 'object' || Array.isArray(v))
          return typeIssue('object', p)
        return Object.entries(shape).flatMap(([key, schema]) =>
          schema.check((v as Record<string, unknown>)[key], [...p, key]),
        )
      },
    )
  },

  /** 允许 undefined（对象字段缺省 / 整个参数可省略） */
  optional: <T>(inner: Schema<T>): Schema<T | undefined> =>
    createSchema(
      inner.json,
      (v, p) => (v === undefined ? [] : inner.check(v, p)),
      true,
    ),
}
