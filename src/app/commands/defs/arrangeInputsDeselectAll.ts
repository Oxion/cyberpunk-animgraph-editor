import { AppCommandDef } from "@/core/commands"

export const ArrangeInputsDeselectAllCommandId = 'arrangeInputs.deselectAll'

export interface ArrangeInputsDeselectAllCommandDef extends AppCommandDef {
  id: typeof ArrangeInputsDeselectAllCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ArrangeInputsDeselectAllCommandId]: ArrangeInputsDeselectAllCommandDef
  }
}

export const arrangeInputsDeselectAllCommandDef: ArrangeInputsDeselectAllCommandDef = {
  id: ArrangeInputsDeselectAllCommandId,
  label: 'Deselect All Incoming',
  group: 'Arrange',
}