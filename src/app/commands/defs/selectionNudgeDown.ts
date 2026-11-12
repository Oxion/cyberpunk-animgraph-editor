import { AppCommandDef } from "@/core/commands"

export const SelectionNudgeDownCommandId = 'selection.nudgeDown'

export interface SelectionNudgeDownCommandDef extends AppCommandDef {
  id: typeof SelectionNudgeDownCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionNudgeDownCommandId]: SelectionNudgeDownCommandDef
  }
}

export const selectionNudgeDownCommandDef: SelectionNudgeDownCommandDef = {
  id: SelectionNudgeDownCommandId,
  label: 'Nudge Selection Down',
  group: 'Nudge',
  when: 'canNudgeSelection',
}