import { AppCommandDef } from "@/core/commands"

export const SelectionNudgeRightCommandId = 'selection.nudgeRight'

export interface SelectionNudgeRightCommandDef extends AppCommandDef {
  id: typeof SelectionNudgeRightCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [SelectionNudgeRightCommandId]: SelectionNudgeRightCommandDef
  }
}

export const selectionNudgeRightCommandDef: SelectionNudgeRightCommandDef = {
  id: SelectionNudgeRightCommandId,
  label: 'Nudge Selection Right',
  group: 'Nudge',
  when: 'canNudgeSelection',
}