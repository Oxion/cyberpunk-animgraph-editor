import { setGrabAxisLock } from '../composables/tools/grabMove'

export function lockGrabMoveX() {
  setGrabAxisLock('x')
}

export function lockGrabMoveY() {
  setGrabAxisLock('y')
}
