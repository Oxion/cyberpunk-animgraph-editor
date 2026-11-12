import { AppCommandDef } from "@/core/commands"

export const SelectInputsAddCommandId = 'selectInputs.add'

export interface ISelectInputsAddCommandArgs {
  recursive: boolean
}

export interface SelectInputsAddCommandDef extends AppCommandDef {
  id: typeof SelectInputsAddCommandId
  args?: ISelectInputsAddCommandArgs
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectInputsAddCommandId]: SelectInputsAddCommandDef
  }
}

export const selectInputsAddCommandDef: SelectInputsAddCommandDef = {
  id: SelectInputsAddCommandId,
  label: 'Add Input Nodes to Selection',
  group: 'Selection',
  when: 'graphEditable',
}