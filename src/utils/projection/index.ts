/**
 * Diagram bridge: canvas field roles, extraPins, wrap, appearance, NodeInputHandler.
 * AnimNodes has no pin concept — pins live here.
 * Writes: prefer bindProjectedInputHandler → animgraphMutation.
 */

export type {
  NestedPinSpec,
  ProjectionAppearance,
  ProjectionDef,
  FieldRole,
} from './types'
export {
  getProjectedInputHandler,
  bindProjectedInputHandler,
  getProjectedPinNames,
  getProjectedFieldNames,
  getProjectedContainFieldNames,
  getFieldRole,
  getFieldRoleForType,
  inferFieldRole,
  getProjectionDef,
  getProjectedWrap,
  inferLinkPinNames,
  isLinkFieldType,
  listExtraPins,
  getExtraPinByName,
} from './resolve'
export {
  DEFAULT_APPEARANCE,
  getProjectedAppearance,
  isProjectedEmbedded,
  isProjectedInitNode,
} from './appearance'
