import {
  endSession,
  ensureToolForSession,
  isToolInProgress,
  startSession,
} from '@/app/tools/pipeline'
import { Tools } from '@/app/tools/ids'

export function grabMoveBegin() {
  if (isToolInProgress(Tools.nodeNudge)) return
  if (!ensureToolForSession(Tools.move)) return
  startSession(Tools.move)
}

export function grabMoveConfirm() {
  endSession(Tools.move, 'confirm')
}

export function grabMoveCancel() {
  endSession(Tools.move, 'cancel')
}
