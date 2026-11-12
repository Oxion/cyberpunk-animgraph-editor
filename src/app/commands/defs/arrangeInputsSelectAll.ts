import { AppCommandDef } from "@/core/commands"

export const ArrangeInputsSelectAllCommandId = 'arrangeInputs.selectAll'

export interface ArrangeInputsSelectAllCommandDef extends AppCommandDef {
  id: typeof ArrangeInputsSelectAllCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ArrangeInputsSelectAllCommandId]: ArrangeInputsSelectAllCommandDef
  }
}

export const arrangeInputsSelectAllCommandDef: ArrangeInputsSelectAllCommandDef = {
  id: ArrangeInputsSelectAllCommandId,
  label: 'Select All Incoming',
  group: 'Arrange',
}