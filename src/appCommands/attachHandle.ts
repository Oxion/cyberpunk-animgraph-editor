import {
  attachHandleAction,
  clearAttachHandleAction,
  createAttachHandleActionForUI,
} from '../composables/tools/useAttachHandleTool'

export function attachHandleCreate() {
  createAttachHandleActionForUI()
}

export function attachHandleClear() {
  clearAttachHandleAction()
}

export function attachHandleDataFromSelected() {
  attachHandleAction.value?.dataFromSelected()
}

export function attachHandleRun() {
  attachHandleAction.value?.run()
}
