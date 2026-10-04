import type { AnimgraphObject } from './graph/animgraphTypes'
import type { AnimFieldType } from './animFieldSchema'
import {
  generateDataTemplate,
  getAnimTypeFields,
  isAnimType,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
} from './animFieldSchema'
import type { FieldConstraint, NodeChildHandler, NodeInputHandler } from './animNodes'
import { childHandlerForOrder } from './animNodes'
import { getProjectedContainFieldNames, getProjectedInputHandler, getProjectedPinNames, isProjectedEmbedded, isProjectedInitNode } from './projection'
import { NODE_DEFINITION_ENTRIES } from './animNodes/catalog'

export type {
  AnimFieldDef,
  AnimFieldType,
  AnimFieldDerived,
  AnimTypeDef,
  AnimTypeName,
} from './animFieldSchema'
export {
  AnimTypes,
  registerAnimType,
  resolveAnimFields,
  inferAnimFieldDef,
  isAnimFieldDerived,
  readDerivedArrayLength,
  resolveAnimType,
  getAnimTypeParent,
  isAnimType,
  getAnimEnumValues,
  isArrayFieldType,
  isRefFieldType,
  isWrefFieldType,
  fieldTypeName,
  getAnimTypeFields,
  structWrefNodeTarget,
  generateDataTemplate,
  generateArrayElementTemplate,
  generateArrayElementValue,
} from './animFieldSchema'

export type { FieldConstraint, NodeChildHandler, NodeInputHandler } from './animNodes'

/**
 * Node-layer catalog extras: constraints, templates, parent-slot rules.
 * Pin vs contain lives in projection.
 */
export interface NodeDefinition {
  /**
   * Per-field catalog rules: contain invariants and inspector editor overlays.
   * Not the child-slot list — slots come from projection contain.
   */
  fieldConstraints?: Record<string, FieldConstraint>
  /**
   * Where this type may be attached as a child handle.
   * Omit = allowed in any parent slot that accepts it (via slot.allowedTypes or open slot).
   */
  allowedParentSlots?: AllowedParentSlot[]
  description?: string
  dataTemplate?: AnimgraphObject
}

/** One children-field on a parent handle (visualized as PropertyGroup in the diagram). */
export type ChildSlotKind = 'array' | 'scalar'

export type ChildSlotDef = {
  name: string
  kind: ChildSlotKind
  /** If set, only these $types (and subtypes) may be added. Omit = inferred from field `ref`/`wref`. */
  allowedTypes?: readonly string[]
  /** At most one instance of each listed type in this slot. */
  uniqueTypes?: readonly string[]
  /** Expected types for a healthy graph (e.g. Output in State.nodes). */
  requireTypes?: readonly string[]
  /** Post-insert ordering from fieldConstraints.order. */
  order?: 'output-first'
}

export type AllowedParentSlot = {
  parentType: string
  slot: string
}

function inferSlotAllowedTypes(fieldType: AnimFieldType): readonly string[] | undefined {
  let inner = fieldType
  while (isArrayFieldType(inner)) inner = inner.array
  if (isRefFieldType(inner)) return [inner.ref]
  if (isWrefFieldType(inner)) return [inner.wref]
  return undefined
}

function inferConstraintSlotKind(
  def: NodeDefinition | null | undefined,
  fieldName: string,
  nodeType?: string
): ChildSlotKind {
  const typeName =
    nodeType ??
    (typeof def?.dataTemplate?.$type === 'string' ? def.dataTemplate.$type : undefined)
  if (typeName) {
    const field = getAnimTypeFields(typeName).find((f) => f.key === fieldName)
    if (field) return isArrayFieldType(field.type) ? 'array' : 'scalar'
  }
  const sample = def?.dataTemplate?.[fieldName]
  if (Array.isArray(sample)) return 'array'
  if (sample !== undefined) return 'scalar'
  return 'array'
}

/**
 * Registry of node definitions for all node types
 */
export class NodeDefinitionRegistry {
  private static nodeDefinitions: Map<string, NodeDefinition> = new Map<string, NodeDefinition>(NODE_DEFINITION_ENTRIES)

  /**
   * Get node definition for a node type
   * @param nodeType - The type of the node
   * @returns Node definition or null if not found
   */
  static getNodeDefinition(nodeType: string): NodeDefinition | null {
    return this.nodeDefinitions.get(nodeType) || null
  }

  static getFieldConstraint(
    nodeType: string,
    fieldKey: string
  ): FieldConstraint | undefined {
    return this.getNodeDefinition(nodeType)?.fieldConstraints?.[fieldKey]
  }

  /**
   * Topology slots for add-node: projection contain fields.
   * `fieldConstraints` overlay matching names (allowedTypes, order, …).
   */
  static getChildSlots(
    def: NodeDefinition | null | undefined,
    nodeType?: string
  ): ChildSlotDef[] {
    const typeName =
      nodeType ??
      (typeof def?.dataTemplate?.$type === 'string' ? def.dataTemplate.$type : undefined)
    if (!typeName) return []
    const fields = getAnimTypeFields(typeName)
    const constraints = def?.fieldConstraints
    return this.getChildFields(typeName).map((name) => {
      const field = fields.find((f) => f.key === name)
      const inferredAllowed = field ? inferSlotAllowedTypes(field.type) : undefined
      const overlay = constraints?.[name]
      return {
        name,
        kind: inferConstraintSlotKind(def, name, typeName),
        allowedTypes: inferredAllowed,
        ...overlay,
      }
    })
  }

  static getChildSlot(
    def: NodeDefinition | null | undefined,
    slotName: string,
    nodeType?: string
  ): ChildSlotDef | undefined {
    return this.getChildSlots(def, nodeType).find((s) => s.name === slotName)
  }

  /** Array fields grouped by `fieldConstraints.sameLength` id. */
  static getSameLengthGroups(nodeType: string): Map<string, string[]> {
    const groups = new Map<string, string[]>()
    const constraints = this.getNodeDefinition(nodeType)?.fieldConstraints
    if (!constraints) return groups
    for (const [field, constraint] of Object.entries(constraints)) {
      const id = constraint.sameLength
      if (!id) continue
      const list = groups.get(id)
      if (list) list.push(field)
      else groups.set(id, [field])
    }
    return groups
  }

  static isEmbeddedHandle(nodeType: string): boolean {
    return isProjectedEmbedded(nodeType)
  }

  /** True when this $type belongs in animgraph nodesToInit. */
  static isNodesToInitType(nodeType: string): boolean {
    return isProjectedInitNode(nodeType)
  }

  /**
   * Diagram contain fields: projection role `contain` (default: type `ref`).
   */
  static getChildFields(nodeType: string): string[] {
    return getProjectedContainFieldNames(nodeType)
  }

  /**
   * Diagram pin names: projection role `pin` + extraPins (default: link / wref).
   */
  static getInputFields(nodeType: string): string[] {
    return getProjectedPinNames(nodeType)
  }

  /**
   * Check if a field is a child field for a node type
   * @param nodeType - The type of the node
   * @param fieldName - The name of the field to check
   * @returns True if the field is a child field
   */
  static isChildField(nodeType: string, fieldName: string): boolean {
    const childFields = this.getChildFields(nodeType)
    return childFields.includes(fieldName)
  }

  /**
   * Check if a field is an input field for a node type
   * @param nodeType - The type of the node
   * @param fieldName - The name of the field to check
   * @returns True if the field is an input field
   */
  static isInputField(nodeType: string, fieldName: string): boolean {
    const inputFields = this.getInputFields(nodeType)
    return inputFields.includes(fieldName)
  }

  /**
   * Get all registered node types
   * @returns Array of all registered node types
   */
  static getAllNodeTypes(): string[] {
    return Array.from(this.nodeDefinitions.keys())
  }

  /**
   * Add a new node definition
   * @param nodeType - The type of the node
   * @param definition - The node definition
   */
  static addNodeDefinition(nodeType: string, definition: NodeDefinition): void {
    this.nodeDefinitions.set(nodeType, definition)
  }

  static getNodeInputHandler(nodeType: string, inputName: string): NodeInputHandler {
    return getProjectedInputHandler(nodeType, inputName)
  }

  static getHandleTypeChildrenHandler(nodeType: string, childrenPropName: string): NodeChildHandler | undefined {
    return this.getHandleDefChildrenHandler(this.getNodeDefinition(nodeType), childrenPropName)
  }

  static getHandleDefChildrenHandler(handleDef: NodeDefinition | null | undefined, childrenPropName: string): NodeChildHandler | undefined {
    return childHandlerForOrder(handleDef?.fieldConstraints?.[childrenPropName]?.order)
  }

  static getHandleTypeDataTemplate(nodeType: string): AnimgraphObject | undefined {
    const generated = generateDataTemplate(nodeType)
    const listed = this.getNodeDefinition(nodeType)?.dataTemplate
    if (!generated && !listed) return undefined
    return JSON.parse(
      JSON.stringify({ ...(generated ?? { $type: nodeType }), ...(listed ?? {}) })
    ) as AnimgraphObject
  }

  static getHandleDefTypeDataTemplate(
    handleDef: NodeDefinition | null | undefined,
    nodeType?: string
  ): AnimgraphObject | undefined {
    const type =
      nodeType ??
      (typeof handleDef?.dataTemplate?.$type === 'string'
        ? handleDef.dataTemplate.$type
        : undefined)
    if (type) return this.getHandleTypeDataTemplate(type)
    if (!handleDef?.dataTemplate) return undefined
    return JSON.parse(JSON.stringify(handleDef.dataTemplate)) as AnimgraphObject
  }

  static passesSlotAllowedTypes(slot: ChildSlotDef, nodeType: string): boolean {
    if (!slot.allowedTypes?.length) return true
    return slot.allowedTypes.some((base) => isAnimType(nodeType, base))
  }
}
