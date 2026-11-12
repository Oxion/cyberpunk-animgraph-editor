import { AppCommandDef } from "@/core/commands"

export const SelectionSelectChildrenCommandId = 'selection.selectChildren'

export interface SelectionSelectChildrenCommandDef extends AppCommandDef {
  id: typeof SelectionSelectChildrenCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionSelectChildrenCommandId]: SelectionSelectChildrenCommandDef
  }
}

export const selectionSelectChildrenCommandDef: SelectionSelectChildrenCommandDef = {
  id: SelectionSelectChildrenCommandId,
  label: 'Select Children',
  group: 'Selection',
  when: 'canSelectChildren',
}