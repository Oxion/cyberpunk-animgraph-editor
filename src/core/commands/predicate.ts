import { PredicateContext, whenTrue } from "@/core/when";
import { AppCommand, AppCommandId } from "./types";
import { getAppCommand } from "./catalog";

export function commandWithIdEnabled(id: AppCommandId, ctx: PredicateContext): boolean {
  return commandEnabled(getAppCommand(id), ctx)
}

export function commandEnabled(command: AppCommand, ctx: PredicateContext): boolean {
  return !command.when || whenTrue(command.when, ctx)
}