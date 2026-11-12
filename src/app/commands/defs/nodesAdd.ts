import { AppCommandDef } from "@/core/commands"

export const NodesAddCommandId = 'nodes.add'

export interface INodesAddCommandArgs {
  id: string
  type: string
  slotName?: string
}

export interface INodesAddCommandDef extends AppCommandDef {
  id: typeof NodesAddCommandId
  args?: INodesAddCommandArgs
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [NodesAddCommandId]: INodesAddCommandDef
  }
}

export const nodesAddCommandDef: INodesAddCommandDef = { 
  id: NodesAddCommandId, 
  label: 'Add Node',
  group: 'Add',
  when: 'graphEditable',
}