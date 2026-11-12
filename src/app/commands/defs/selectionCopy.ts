import { AppCommandDef } from "@/core/commands"

export const SelectionCopyCommandId = 'selection.copy'

export interface SelectionCopyCommandDef extends AppCommandDef {
  id: typeof SelectionCopyCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionCopyCommandId]: SelectionCopyCommandDef
  }
}

export const selectionCopyCommandDef: SelectionCopyCommandDef = {
  id: SelectionCopyCommandId,
  label: 'Copy Selection',
  group: 'Clipboard',
  when: 'canCopySelection',
}