import { AppCommandDef } from "@/core/commands"

export const AddConnectionFocusCommandId = 'addConnection.focus'

export interface AddConnectionFocusCommandDef extends AppCommandDef {
  id: typeof AddConnectionFocusCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AddConnectionFocusCommandId]: AddConnectionFocusCommandDef
  }
}

export const addConnectionFocusCommandDef: AddConnectionFocusCommandDef = {
  id: AddConnectionFocusCommandId,
  label: 'Focus Add Connection',
  group: 'Add',
  when: 'canFocusAppTool',
}