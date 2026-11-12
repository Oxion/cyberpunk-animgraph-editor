import { AppCommandDef } from "@/core/commands"

export const AddConnectionCreateCommandId = 'addConnection.create'

export interface IAddConnectionCreateCommandArgs {
  fromId: string
  toId: string
  pinName: string
}

export interface AddConnectionCreateCommandDef extends AppCommandDef {
  id: typeof AddConnectionCreateCommandId
  args?: IAddConnectionCreateCommandArgs
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AddConnectionCreateCommandId]: AddConnectionCreateCommandDef
  }
}

export const addConnectionCreateCommandDef: AddConnectionCreateCommandDef = {
  id: AddConnectionCreateCommandId,
  label: 'Create Connection',
  group: 'Connection',
  when: 'graphEditable',
}