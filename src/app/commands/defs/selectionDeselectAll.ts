import { AppCommandDef } from "@/core/commands"

export const SelectionDeselectAllCommandId = 'selection.deselectAll'

export interface SelectionDeselectAllCommandDef extends AppCommandDef {
  id: typeof SelectionDeselectAllCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionDeselectAllCommandId]: SelectionDeselectAllCommandDef
  }
}

export const selectionDeselectAllCommandDef: SelectionDeselectAllCommandDef = {
  id: SelectionDeselectAllCommandId,
  label: 'Deselect All',
  group: 'Selection',
  when: 'canDeselectAll',
}