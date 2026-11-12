import { AppCommandDef } from "@/core/commands"

export const AddNodeFocusCommandId = 'addNode.focus'

export interface AddNodeFocusCommandDef extends AppCommandDef {
  id: typeof AddNodeFocusCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [AddNodeFocusCommandId]: AddNodeFocusCommandDef
  }
}

export const addNodeFocusCommandDef: AddNodeFocusCommandDef = {
  id: AddNodeFocusCommandId,
  label: 'Focus Add Node',
  group: 'Add',
  when: 'canFocusAppTool',
}