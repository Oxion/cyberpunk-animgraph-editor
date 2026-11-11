import type { AppCommandArgs } from '../commands/types'
import { arrangeSelectedNodesWithElk } from '../composables/tools/moveResizeSession'
import { requireActiveDiagramId } from '../stores/graphProject'
import { Commands } from './ids'

export async function arrangeSelectionRun(args: AppCommandArgs<typeof Commands.arrangeSelection.run>) {
  await arrangeSelectedNodesWithElk(requireActiveDiagramId(), args)
}
