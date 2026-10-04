import { Signal, UnwrapSignals, WatcherSub } from './types';
import { INTERNAL_REGISTER_DEPENDENCY, IInternalRunnable } from './internalApi';

export class WatcherNode<TArgs extends readonly Signal<any>[]> implements IInternalRunnable {
  public readonly rank: number;

  private _deps: TArgs;
  private _effectFn: ((...args: UnwrapSignals<TArgs>) => void) | null;

  constructor(
    deps: TArgs,
    effectFn: (...args: UnwrapSignals<TArgs>) => void,
    immediate: boolean = false,
  ) {
    this._deps = deps;
    this._effectFn = effectFn;

    let maxDepRank = -1;
    const len = deps.length;
    for (let i = 0; i < len; i++) {
      const dep = deps[i];
      if (dep.rank > maxDepRank) maxDepRank = dep.rank;
      dep[INTERNAL_REGISTER_DEPENDENCY](this);
    }

    this.rank = maxDepRank + 1;

    if (immediate) this.run();
  }

  public run(): void {
    if (this._effectFn === null) return;

    const len = this._deps.length;
    const args = new Array(len);
    for (let i = 0; i < len; i++) {
      args[i] = this._deps[i].value;
    }
    this._effectFn(...(args as any));
  }

  public destroy(): void {
    this._effectFn = null
    this._deps = [] as any
  }
}

export function watcher<TArgs extends readonly Signal<any>[]>(
  deps: TArgs,
  effectFn: (...args: UnwrapSignals<TArgs>) => void,
  immediate: boolean = false
): WatcherSub {
  
  const node = new WatcherNode(deps, effectFn, immediate);

  let strongRef: WatcherNode<TArgs> | null = node;

  return {
    remove: () => {
      if (strongRef === null) return;
    
      strongRef.destroy();
    
      strongRef = null; 
    }
  }
}
