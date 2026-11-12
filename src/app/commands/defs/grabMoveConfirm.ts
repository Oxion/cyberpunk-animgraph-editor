import { AppCommandDef } from "@/core/commands"

export const GrabMoveConfirmCommandId = 'grabMove.confirm'

export interface GrabMoveConfirmCommandDef extends AppCommandDef {
  id: typeof GrabMoveConfirmCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [GrabMoveConfirmCommandId]: GrabMoveConfirmCommandDef
  }
}

export const grabMoveConfirmCommandDef: GrabMoveConfirmCommandDef = {
  id: GrabMoveConfirmCommandId,
  label: 'Confirm Move',
  group: 'Move',
  when: 'moveInProgress',
}