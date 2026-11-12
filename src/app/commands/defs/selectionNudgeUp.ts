import { AppCommandDef } from "@/core/commands"

export const SelectionNudgeUpCommandId = 'selection.nudgeUp'

export interface SelectionNudgeUpCommandDef extends AppCommandDef {
  id: typeof SelectionNudgeUpCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionNudgeUpCommandId]: SelectionNudgeUpCommandDef
  }
}

export const selectionNudgeUpCommandDef: SelectionNudgeUpCommandDef = {
  id: SelectionNudgeUpCommandId,
  label: 'Nudge Selection Up',
  group: 'Nudge',
  when: 'canNudgeSelection',
}