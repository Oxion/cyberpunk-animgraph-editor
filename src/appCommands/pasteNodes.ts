import { requireActiveDiagramId } from '../stores/graphProject'
import { pasteClipboardNodes } from '../stores/graphNodeCrud'
import { commandEnabled } from '../stores/appContext'

export function pasteNodes() {
  if (!commandEnabled('nodes.paste')) return
  const result = pasteClipboardNodes(requireActiveDiagramId())
  if (!result.ok && result.message) alert(result.message)
}
