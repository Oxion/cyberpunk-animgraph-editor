/**
 * Per-diagramNodeType add-plan actions — mutation recipe after gate + diagram builder.
 */

export type {
  AddNodeAction,
  AddNodeActionKind,
  AddNodeActionMap,
  AttachHandleAction,
  AttachHandleToAction,
  EnsureDiagramChildAction,
  EnsureDiagramChildParent,
  EnsurePropertyGroupAction,
  PlaceInParentAction,
  PlaceInParentMode,
  RegisterFloatingHandleAction,
} from './types'

export type {
  DiagramAddActionsResolveResult,
  DiagramAddActionsResolver,
  DiagramAddActionsResolverInput,
} from './resolveTypes'

export { resolvePlaceInParentMode } from './placeMode'

export {
  attachHandleAction,
  compileAttachWithRequiredChildren,
  compileRequiredChildrenActions,
  placeInParentAction,
  pushAnimgraphHandleActions,
  registerFloatingHandleAction,
} from './compile'

export {
  resolveAddNodeActions,
  resolveConditionalEntryWrapperActions,
  resolveDefaultActions,
  resolveStateActions,
  resolveTransitionWrapperActions,
  resolveWrapperRootBodyActions,
  resolversByDiagramNodeType,
} from './resolvers'
