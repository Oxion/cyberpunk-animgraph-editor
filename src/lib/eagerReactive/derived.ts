import { Signal, UnwrapSignals } from './types';
import { Node } from './node';
import { IInternalRunnable, IInternalNode, INTERNAL_REGISTER_DEPENDENCY } from './internalApi';

class DerivedSignal<T, TArgs extends readonly Signal<any>[]> 
  extends Node 
  implements Signal<T>, IInternalNode, IInternalRunnable
{
  public readonly rank: number;
  private _value: T;
  private _deps: TArgs;
  private _computeFn: (...args: UnwrapSignals<TArgs>) => T;

  constructor(deps: TArgs, computeFn: (...args: UnwrapSignals<TArgs>) => T) {
    super();
    this._deps = deps;
    this._computeFn = computeFn;

    let maxDepRank = -1;
    const len = deps.length;
    for (let i = 0; i < len; i++) {
      const dep = deps[i];
      if (dep.rank > maxDepRank) maxDepRank = dep.rank;
      dep[INTERNAL_REGISTER_DEPENDENCY](this);
    }

    this.rank = maxDepRank + 1;

    this._value = this._executeCompute();
  }

  get value(): T { 
    return this._value; 
  }

  private _executeCompute(): T {
    const len = this._deps.length;
    const args = new Array(len);
    for (let i = 0; i < len; i++) {
      args[i] = this._deps[i].value;
    }
    return this._computeFn(...(args as any));
  }

  public run(): void {
    const newValue = this._executeCompute();
    if (this._value === newValue) return;
    this._value = newValue;

    this.notifyAll();
  }
}

export function derived<T, TArgs extends readonly Signal<any>[]>(
  deps: TArgs, 
  computeFn: (...args: UnwrapSignals<TArgs>) => T
): Signal<T> {
  return new DerivedSignal(deps, computeFn);
}
