import { AppCommandDef } from "@/core/commands"

export const ArrangeInputsToggleCommandId = 'arrangeInputs.toggle'

export interface IArrangeInputsToggleCommandArgs {
  key: string
  checked: boolean
}

export interface ArrangeInputsToggleCommandDef extends AppCommandDef {
  id: typeof ArrangeInputsToggleCommandId
  args?: IArrangeInputsToggleCommandArgs
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ArrangeInputsToggleCommandId]: ArrangeInputsToggleCommandDef
  }
}

export const arrangeInputsToggleCommandDef: ArrangeInputsToggleCommandDef = {
  id: ArrangeInputsToggleCommandId,
  label: 'Toggle Incoming Connection',
  group: 'Arrange',
}