export interface IInternalDependency {
  readonly rank: number;
}

export interface IInternalRunnable extends IInternalDependency {
  run(): void;
}

export const INTERNAL_REGISTER_DEPENDENCY = Symbol('INTERNAL_REGISTER_DEPENDENCY');

export interface IInternalNode extends IInternalDependency {
  [INTERNAL_REGISTER_DEPENDENCY](runnable: IInternalRunnable): void;
}