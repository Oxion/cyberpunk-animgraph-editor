import { AppCommandDef } from "@/core/commands"

export const ResizeConfirmCommandId = 'resize.confirm'

export interface ResizeConfirmCommandDef extends AppCommandDef {
  id: typeof ResizeConfirmCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeConfirmCommandId]: ResizeConfirmCommandDef
  }
}

export const resizeConfirmCommandDef: ResizeConfirmCommandDef = {
  id: ResizeConfirmCommandId,
  label: 'Confirm Resize',
  group: 'Resize',
  when: 'resizeInProgress',
}