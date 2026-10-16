/**
 * Base sim-driver types:
 * - SimDriver — live driver contract (attach/detach)
 * - SimDriverDef — InstanceStateDef for drivers (id + create + codecs)
 * - SimDriverHandle — store-owned wrapper around a live driver
 * - SimDriverAttachCtx — base attach context (runner + extensible)
 */

import { ref, type Ref } from 'vue'
import { InstanceStateDef } from '../InstanceStore'
import type { SimGraphRunner } from './SimGraphRunner'

export const SIM_DRIVER_DEFAULT_ID = 'default'

export type SimDriversProjectJson = {
  version: 1
  instances: SimDriverInstanceJson[]
}

export type SimDriverInstanceJson = {
  driverDefId: string
  id: string
  runnerId?: string | null
  attached?: boolean
  state: unknown
}

/** Base attach context — HandleDef resolvers may extend. */
export type SimDriverAttachCtx = {
  /** Present when the driver hooks a runner (LookAt / MixerSlot). */
  runner?: SimGraphRunner
}

/** Every sim driver implements attach/detach against an attach context. */
export interface SimDriver {
  attach(ctx: SimDriverAttachCtx): void
  detach(): void
}

/** Props for handle InstanceStore create — handle fields separate from driver create props. */
export type SimDriverHandleCreateProps<TProps = void> = {
  id: string
  onTouch: () => void
  driverProps: TProps
}

/**
 * Driver kind as InstanceStateDef: stable id + create(props) → TDriver.
 * Not used as the handle store key — see SimDriverHandleDef.
 */
export abstract class SimDriverDef<
  TDriver extends SimDriver,
  TProps = void,
> extends InstanceStateDef<TDriver, TProps> {
  abstract readonly label: string

  abstract serialize(driver: TDriver): unknown
  abstract applyState(driver: TDriver, state: unknown): void

  protected constructor(id: string, create: (props: TProps) => TDriver) {
    super(id, create)
  }
}

/** Store-owned handle wrapping a live SimDriver. */
export class SimDriverHandle<TDriver extends SimDriver = SimDriver> {
  readonly id: string
  readonly driverDefId: string
  readonly driver: TDriver

  /** Per-handle UI revision — bump via touch() so Vue can target one handle. */
  readonly rev: Ref<number> = ref(0)

  private _attached = false
  private _runnerId: string | undefined

  constructor(
    driverDefId: string,
    id: string,
    driver: TDriver,
    private readonly onTouch: () => void
  ) {
    this.id = id
    this.driverDefId = driverDefId
    this.driver = driver
  }

  /** Runner from last successful attach(); null when detached/disposed. */
  get runnerId(): string | undefined {
    return this._runnerId
  }

  /** True after driver.attach until driver.detach. */
  get attached(): boolean {
    return this._attached
  }

  touch(): void {
    this.rev.value++
    this.onTouch()
  }

  attach(ctx: SimDriverAttachCtx): void {
    this._runnerId = ctx.runner?.runnerId
    this.driver.attach(ctx)
    this._attached = true
  }

  detach(): void {
    this.driver.detach()
    this._attached = false
    this._runnerId = undefined
  }

  dispose(): void {
    this.detach()
  }
}
