import { IInternalNode } from './internalApi';

export interface Signal<T> extends IInternalNode {
  readonly value: T;
}

export interface WritableSignal<T> extends Signal<T> {
  value: T;
}

export type UnwrapSignals<T extends readonly Signal<any>[]> = {
  [K in keyof T]: T[K] extends Signal<infer U> ? U : never;
}

export interface WatcherSub {
  remove(): void;
}