import { AppCommandDef } from "@/core/commands"
import { ArrangeSelectionAlgorithm, ElkLayeredVariant } from "@/utils/graph/ElkGraphLayout"

export const ArrangeSelectionRunCommandId = 'arrangeSelection.run'

export interface IArrangeSelectionRunCommandArgs {
  algorithm: ArrangeSelectionAlgorithm
  layeredVariant: ElkLayeredVariant
  nodeNodeSpacing: number
  layerSpacing: number
  forceIterations: number
}

export interface ArrangeSelectionRunCommandDef extends AppCommandDef {
  id: typeof ArrangeSelectionRunCommandId
  args?: IArrangeSelectionRunCommandArgs
}

declare module '@/core/commands/types' {
  interface AppCommandMap {
    [ArrangeSelectionRunCommandId]: ArrangeSelectionRunCommandDef
  }
}

export const arrangeSelectionRunCommandDef: ArrangeSelectionRunCommandDef = {
  id: ArrangeSelectionRunCommandId,
  label: 'Arrange Selection',
  group: 'Arrange',
  when: 'graphEditable',
}