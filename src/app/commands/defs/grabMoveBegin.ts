import { AppCommandDef } from "@/core/commands"

export const GrabMoveBeginCommandId = 'grabMove.begin'

export interface GrabMoveBeginCommandDef extends AppCommandDef {
  id: typeof GrabMoveBeginCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [GrabMoveBeginCommandId]: GrabMoveBeginCommandDef
  }
}

export const grabMoveBeginCommandDef: GrabMoveBeginCommandDef = {
  id: GrabMoveBeginCommandId,
  label: 'Begin Move',
  group: 'Move',
  when: 'canBeginGrabMove',
}