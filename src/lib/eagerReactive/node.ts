import { globalQueue } from './queue';
import { INTERNAL_REGISTER_DEPENDENCY, IInternalNode, IInternalRunnable } from './internalApi';

export abstract class Node implements IInternalNode {
  public abstract readonly rank: number;

  private runnableRefs: WeakRef<IInternalRunnable>[] = [];

  public [INTERNAL_REGISTER_DEPENDENCY](runnable: IInternalRunnable): void {
    this.runnableRefs.push(new WeakRef(runnable));
  }

  protected notifyAll(): void {
    const refs = this.runnableRefs;
    let len = refs.length;
    let writeIndex = 0;

    for (let i = 0; i < len; i++) {
      const runnable = refs[i].deref();
      if (runnable !== undefined) {
        globalQueue.add(runnable);
        if (writeIndex !== i) {
          refs[writeIndex] = refs[i];
        }
        writeIndex++;
      }
    }

    if (writeIndex < len) {
      refs.length = writeIndex;
    }
  }
}