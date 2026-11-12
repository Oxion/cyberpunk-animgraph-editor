import { AppCommandDef } from "@/core/commands"

export const ResizeBeginCommandId = 'resize.begin'

export interface ResizeBeginCommandDef extends AppCommandDef {
  id: typeof ResizeBeginCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ResizeBeginCommandId]: ResizeBeginCommandDef
  }
}

export const resizeBeginCommandDef: ResizeBeginCommandDef = {
  id: ResizeBeginCommandId,
  label: 'Begin Resize',
  group: 'Resize',
  when: 'canBeginResize',
}