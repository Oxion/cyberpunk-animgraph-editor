/**
 * InstanceStateDef for handles (InstanceStore key).
 * Per-kind constants live in *DriverHandleDef.ts files.
 */

import { InstanceStateDef } from '../InstanceStore'
import {
  SimDriverDef,
  SimDriverHandle,
  type SimDriver,
  type SimDriverAttachCtx,
  type SimDriverHandleCreateProps,
} from './simDriver'

export const SIM_DRIVER_HANDLE_ID_SUFFIX = ':handle'

export type SimDriverHandleDefProps<
  TDriver extends SimDriver,
  TProps = void,
  TAttachCtx extends SimDriverAttachCtx = SimDriverAttachCtx,
> = {
  driverDef: SimDriverDef<TDriver, TProps>
  /**
   * When set, handle participates in attach lifecycle:
   * ensure → attach(handle); runnersRev → attach all.
   * Return null ⇒ detach (keepRunner).
   */
  resolveAttachCtx?: (
    handle: SimDriverHandle<TDriver>
  ) => TAttachCtx | null | undefined
}

/**
 * InstanceStateDef for handles of one driver kind (live InstanceStore key).
 * create = driverDef.create + new SimDriverHandle.
 */
export class SimDriverHandleDef<
  TDriver extends SimDriver,
  TProps = void,
  TAttachCtx extends SimDriverAttachCtx = SimDriverAttachCtx,
> extends InstanceStateDef<
  SimDriverHandle<TDriver>,
  SimDriverHandleCreateProps<TProps>
> {
  readonly driverDef: SimDriverDef<TDriver, TProps>
  readonly resolveAttachCtx?: (
    handle: SimDriverHandle<TDriver>
  ) => TAttachCtx | null | undefined

  constructor(props: SimDriverHandleDefProps<TDriver, TProps, TAttachCtx>) {
    const { driverDef, resolveAttachCtx } = props
    super(`${driverDef.id}${SIM_DRIVER_HANDLE_ID_SUFFIX}`, (createProps) => {
      const { id, onTouch, driverProps } = createProps
      const driver = driverDef.create(driverProps)
      return new SimDriverHandle(driverDef.id, id, driver, onTouch)
    })
    this.driverDef = driverDef
    this.resolveAttachCtx = resolveAttachCtx
  }

  /**
   * Hydration path — build handle with applied state, no attach.
   * Unlike create/ensure, does not resolve attach ctx.
   */
  restore(
    createProps: SimDriverHandleCreateProps<TProps>,
    state: unknown
  ): SimDriverHandle<TDriver> {
    const { id, onTouch, driverProps } = createProps
    const driver = this.driverDef.create(driverProps)
    this.driverDef.applyState(driver, state)
    return new SimDriverHandle(this.driverDef.id, id, driver, onTouch)
  }

  /** Resolve ctx → attach, or detach when null. No-op if no resolver. */
  attach(handle: SimDriverHandle<TDriver>): void {
    if (!this.resolveAttachCtx) return
    const ctx = this.resolveAttachCtx(handle)

    if (handle.attached || !ctx) {
      handle.detach()
    }

    if (ctx) {
      handle.attach(ctx)
    }
  }
}
