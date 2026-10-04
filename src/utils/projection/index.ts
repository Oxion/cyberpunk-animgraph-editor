export type { NestedPinSpec, ProjectionAppearance, ProjectionDef, FieldRole } from './types'
export {
  getProjectedInputHandler,
  getProjectedPinNames,
  getProjectedFieldNames,
  getProjectedContainFieldNames,
  getFieldRole,
  inferFieldRole,
  getProjectionDef,
  getProjectedWrap,
  inferLinkPinNames,
  isLinkFieldType,
} from './resolve'
export {
  DEFAULT_APPEARANCE,
  getProjectedAppearance,
  isProjectedEmbedded,
  isProjectedInitNode,
} from './appearance'
