import { AppCommandDef } from "@/core/commands"

export const ArrangeInputsRunCommandId = 'arrangeInputs.run'

export interface IArrangeInputsRunCommandArgs {
  margin: number
  spacing: number
}

export interface ArrangeInputsRunCommandDef extends AppCommandDef {
  id: typeof ArrangeInputsRunCommandId
  args?: IArrangeInputsRunCommandArgs
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ArrangeInputsRunCommandId]: ArrangeInputsRunCommandDef
  }
}

export const arrangeInputsRunCommandDef: ArrangeInputsRunCommandDef = {
  id: ArrangeInputsRunCommandId,
  label: 'Arrange Inputs',
  group: 'Arrange',
  when: 'graphEditable',
}