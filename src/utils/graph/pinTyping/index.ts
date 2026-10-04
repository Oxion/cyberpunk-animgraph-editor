/**
 * Pin typing: endpoint gather (codegen) + type→color resolve + connect check.
 */

export type { AnimgraphPinWalkMode } from './pinFields'
export {
  expectedTypeFromExtraPin,
  fieldContainerKind,
  isPinOverrideField,
  listExtraPins,
  listPinFields,
  pinSlotExpectedType,
} from './pinFields'
export {
  collectPinEndpointTypes,
  type CollectPinEndpointOptions,
} from './collectPinEndpoints'
export {
  PIN_ENDPOINT_TYPES,
  PIN_ENDPOINT_TYPE_SET,
  type PinEndpointType,
} from './pinEndpoints.generated'
export {
  PIN_COLOR_FALLBACK,
  PIN_ENDPOINT_COLOR,
} from './pinEndpointColors'
export {
  canConnectByPinType,
  getInputPinColor,
  getInputPinExpectedType,
  pinColorToNumber,
  resolvePinColor,
  resolvePinColorFromType,
} from './resolvePinColor'
