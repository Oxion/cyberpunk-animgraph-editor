import {
  endSession,
  ensureToolForSession,
  startSession,
} from '@/app/tools/pipeline'
import { Tools } from '@/app/tools/ids'

export function resizeBegin() {
  if (!ensureToolForSession(Tools.resize)) return
  startSession(Tools.resize)
}

export function resizeConfirm() {
  endSession(Tools.resize, 'confirm')
}

export function resizeCancel() {
  endSession(Tools.resize, 'cancel')
}
