/**
 * TypeScript shapes for the animgraph type registry (layer 1).
 * No instances / no lookup — see definitions.ts and registry.ts.
 */

export type AnimRefFieldType = { ref: string } | { wref: string }

/** Registry type name, array of a field type, or ref/wref to a class. */
export type AnimFieldType = string | { array: AnimFieldType } | AnimRefFieldType

export type AnimFieldDerived = {
  kind: 'arrayLength'
  key: string
}

/** Domain limits on a specific field (narrows primitive type constraint). */
export type AnimFieldRange = {
  min?: number
  max?: number
  step?: number
}

/** Shared numeric constraint model (type defaults + field overlay). */
export type NumericConstraint = AnimFieldRange & {
  integer?: boolean
  finite?: boolean
}

type PrimitiveTypeDef = {
  constraint?: NumericConstraint
}

export type AnimFieldDef = {
  key: string
  type: AnimFieldType
  derivedFrom?: AnimFieldDerived
  range?: AnimFieldRange
}

export type AnimTypeDef =
  | ({ kind: 'bool01' } & PrimitiveTypeDef)
  | ({ kind: 'int' } & PrimitiveTypeDef)
  | ({ kind: 'float' } & PrimitiveTypeDef)
  | { kind: 'string' }
  | { kind: 'cname' }
  | { kind: 'resourcePath' }
  | { kind: 'object' }
  | { kind: 'unknown' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'struct'; parent?: string; fields: readonly AnimFieldDef[] }
  | { kind: 'class'; parent?: string; fields: readonly AnimFieldDef[] }

export type AnimTypeName = string
