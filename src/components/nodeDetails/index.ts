export {
  PropertyNumberSlider,
  PropertyNumberControl,
  PropertyBoolToggle,
  PropertyTextField,
  PropertyReadonlyRow,
} from './controls'
export {
  detailsPanelsByDiagramType,
  resolveDiagramDetailsPanel,
  type DiagramDetailsPanelEntry,
} from './registry'
export {
  getDiagramDetailsActionDef,
  resolveDiagramDetailsActionIds,
  type DiagramDetailsActionDef,
  type DiagramDetailsActionId,
} from './actions'
export { default as StateMachineDetailsSection } from './StateMachineDetailsSection.vue'
export { default as StateDetailsSection } from './StateDetailsSection.vue'
export { default as TransitionDetailsSection } from './TransitionDetailsSection.vue'
export { default as ConditionalEntryDetailsSection } from './ConditionalEntryDetailsSection.vue'
export { default as TypedDataDetailsSection } from './TypedDataDetailsSection.vue'
export { default as DefaultStackedDetailsSection } from './DefaultStackedDetailsSection.vue'
export { default as PropertyGroupDetailsSection } from './PropertyGroupDetailsSection.vue'
export { default as GroupDetailsSection } from './GroupDetailsSection.vue'
export { default as NoteDetailsSection } from './NoteDetailsSection.vue'
export { default as PortalDetailsSection } from './PortalDetailsSection.vue'
export { default as HandleDataFieldsForm } from './HandleDataFieldsForm.vue'
