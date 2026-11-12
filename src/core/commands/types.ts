/**
 * Command system primitives. App-specific command map is declared in appCommands/types.ts
 * via module augmentation of AppCommandMap.
 */

/** Shape registered in AppCommandMap. `id` is `string` here; each map value narrows it to the key. */
export interface AppCommandDef {
  id: string
  label: string
  /** Settings section name (e.g. History, Move). Omit → Other. */
  group?: string
  /** Hide from Settings / palette (swallow keys, etc.). */
  hidden?: boolean
  /** Named when-predicate (VS Code command precondition). Omit = always. */
  when?: string
}

/**
 * Id → def map. Empty here; appCommands/types.ts augments with concrete commands.
 * Optional phantom `args?` on values types executeCommand / handler payloads.
 */
export interface AppCommandMap {}

export type AppCommandId = keyof AppCommandMap & string
export type AppCommand = AppCommandMap[AppCommandId]

/** Payload type for `executeCommand` / handlers; `undefined` when the command has no `args`. */
export type AppCommandArgs<K extends AppCommandId> = K extends keyof AppCommandMap
  ? 'args' extends keyof AppCommandMap[K]
    ? NonNullable<AppCommandMap[K]['args']>
    : undefined
  : undefined
