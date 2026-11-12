import { PredicateContext } from "@/core/when";
import { AppCommand, AppCommandId } from "@/core/commands";
import { resolveAppPredicateContext } from "../when/context";
import { commandEnabled, commandWithIdEnabled } from "@/core/commands/predicate";

export function appCommandWithIdEnabled(id: AppCommandId, ctx: PredicateContext = resolveAppPredicateContext()): boolean {
  return commandWithIdEnabled(id, ctx)
}

export function appCommandEnabled(command: AppCommand, ctx: PredicateContext = resolveAppPredicateContext()): boolean {
  return commandEnabled(command, ctx)
}
