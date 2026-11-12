import { AppCommandDef } from "@/core/commands"

export const SelectionDeleteCommandId = 'selection.delete'

export interface SelectionDeleteCommandDef extends AppCommandDef {
  id: typeof SelectionDeleteCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionDeleteCommandId]: SelectionDeleteCommandDef
  }
}

export const selectionDeleteCommandDef: SelectionDeleteCommandDef = {
  id: SelectionDeleteCommandId,
  label: 'Delete Selection',
  group: 'Deletion',
  when: 'canDeleteSelection',
}