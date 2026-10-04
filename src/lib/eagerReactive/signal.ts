import { WritableSignal as IWritableSignal } from './types';
import { Node } from './node';

class Signal<T> extends Node implements IWritableSignal<T> {
  public readonly rank = 0;

  constructor(private _value: T) {
    super();
  }

  get value(): T { 
    return this._value; 
  }

  set value(v: T) {
    if (this._value === v) return;
    this._value = v;
    
    this.notifyAll();
  }
}

export function signal<T>(initialValue: T): IWritableSignal<T> {
  return new Signal(initialValue);
}
