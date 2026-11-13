import { lockMoveAxis } from '@/app/tools/handlers/move'

export function lockGrabMoveX() {
  lockMoveAxis('x')
}

export function lockGrabMoveY() {
  lockMoveAxis('y')
}
