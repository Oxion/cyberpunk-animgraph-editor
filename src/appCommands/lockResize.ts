import { setResizeSideLock } from '../composables/tools/resizeSession'

export function lockResizeTop() {
  setResizeSideLock('top')
}

export function lockResizeLeft() {
  setResizeSideLock('left')
}

export function lockResizeBottom() {
  setResizeSideLock('bottom')
}

export function lockResizeRight() {
  setResizeSideLock('right')
}
