import { requireActiveDiagramId } from '../stores/graphProject'
import { pasteClipboardNodes } from '../stores/graphNodeCrud'

export function pasteNodes() {
  const result = pasteClipboardNodes(requireActiveDiagramId())
  if (!result.ok && result.message) alert(result.message)
}
