import { AppCommandDef } from "@/core/commands"

export const NodesPasteCommandId = 'nodes.paste'

export interface NodesPasteCommandDef extends AppCommandDef {
  id: typeof NodesPasteCommandId
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [NodesPasteCommandId]: NodesPasteCommandDef
  }
}

export const nodesPasteCommandDef: NodesPasteCommandDef = {
  id: NodesPasteCommandId,
  label: 'Paste Nodes',
  group: 'Clipboard',
  when: 'canPasteNodes',
}