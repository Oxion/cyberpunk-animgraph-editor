import { lockResizeSide } from '@/app/tools/handlers/resize'

export function lockResizeTop() {
  lockResizeSide('top')
}

export function lockResizeLeft() {
  lockResizeSide('left')
}

export function lockResizeBottom() {
  lockResizeSide('bottom')
}

export function lockResizeRight() {
  lockResizeSide('right')
}
