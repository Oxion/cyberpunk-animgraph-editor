import { AppCommandId } from "@/core/commands";
import { executeCommand, ExecuteRest } from "@/core/commands/execute";
import { resolveAppPredicateContext } from "../when/context";

/** Single public invoke path — gates on command `when`, then runs the handler. */
export function executeAppCommand<K extends AppCommandId>(id: K, ...rest: ExecuteRest<K>): void {
  executeCommand(id, resolveAppPredicateContext(), ...rest)
}