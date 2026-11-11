import { formatAddNodeDenial } from '../components/tools/addNodeCopy'
import type { AppCommandArgs } from '../commands/types'
import { addNewNode } from '../stores/graphNodeCrud'
import { requireActiveDiagramId } from '../stores/graphProject'
import { Commands } from './ids'

export function nodesAdd(args: AppCommandArgs<typeof Commands.nodes.add>) {
  const result = addNewNode(requireActiveDiagramId(), args.id, args.type, args.slotName)
  if (!result.ok) {
    if (result.message) alert(result.message)
    else alert(formatAddNodeDenial(result.reasons, { diagramNodeType: result.diagramNodeType }))
  }
}
